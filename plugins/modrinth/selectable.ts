import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	MessageFlags,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	type ChatInputCommandInteraction,
	type Message,
	type MessageActionRowComponentBuilder,
	type MessageComponentInteraction,
} from "discord.js";
import { trimTextWithSuffix } from "../../lib/utils";

// ─── Shared types ─────────────────────────────────────────────────────────────

export type ItemStatus = "pending" | "processing" | "success" | "failed";

export const STATUS_ICON: Record<ItemStatus, string> = {
	pending: "⬜",
	processing: "⏳",
	success: "✅",
	failed: "❌",
} as const;

export interface ActionDef {
	icon: string;
	label: string;
	/**
	 * When true this action is counted toward the Apply button total and
	 * its items are passed to `process` when the user clicks Apply.
	 * Set to false for "skip"-style actions.
	 */
	isActive: boolean;
}

export interface ResultGroup {
	icon: string;
	label: string;
	items: string[];
	/** Marks this group as failures for the colour-logic calculation. */
	isFailed?: boolean;
}

// ─── Shared constants ─────────────────────────────────────────────────────────

export const BAR_WIDTH = 20;
const MAX_SELECT_OPTIONS = 25;

// Internal button / select IDs — sufficiently unique to avoid collision with
// the host command's own component IDs.
const APPLY_ID = "__sel_apply__";
const CANCEL_ID = "__sel_cancel__";
const SELECT_ID = "__sel_select__";

// ─── Shared utilities ─────────────────────────────────────────────────────────

/**
 * Renders a code-block progress bar.
 * Example: `[████████░░░░░░░░░░░░] 40% (2/5)`
 */
export function buildProgressBar(done: number, total: number): string {
	const filled =
		total === 0 ? BAR_WIDTH : Math.round((done / total) * BAR_WIDTH);
	const pct = total === 0 ? 100 : Math.round((done / total) * 100);
	return `\`[${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)}] ${pct}% (${done}/${total})\``;
}

/**
 * Joins `items` up to Discord's 1 024-character embed field value limit.
 * Appends an "*… and N more*" tail when the list is truncated.
 */
export function truncateList(items: string[], separator = "\n"): string {
	const MAX = 1024;
	let text = "";
	for (let i = 0; i < items.length; i++) {
		const line = (i > 0 ? separator : "") + items[i];
		if (text.length + line.length > MAX - 30) {
			text += `${separator}*… and ${items.length - i} more*`;
			break;
		}
		text += line;
	}
	return text || "—";
}

// ─── Shared embed builders ────────────────────────────────────────────────────

/**
 * Generic live-progress embed used while items are being processed one-by-one.
 *
 * Discord caps embeds at 25 fields; excess entries are noted in the footer.
 */
export function buildProgressEmbed(params: {
	title?: string;
	color?: number;
	entries: Array<{ name: string; value: string; status: ItemStatus }>;
	completed: number;
	total: number;
}): EmbedBuilder {
	const {
		title = "⚙️ Applying Changes",
		color = 0x3498db,
		entries,
		completed,
		total,
	} = params;

	const embed = new EmbedBuilder()
		.setTitle(title)
		.setColor(color)
		.setDescription(buildProgressBar(completed, total))
		.setTimestamp();

	for (const entry of entries.slice(0, 25)) {
		embed.addFields({
			name: `${STATUS_ICON[entry.status]} ${entry.name}`.slice(0, 256),
			value: entry.value,
			inline: true,
		});
	}

	const overflow = entries.length - 25;
	if (overflow > 0) {
		embed.setFooter({
			text: `… and ${overflow} more | Processing ${total} total`,
		});
	}

	return embed;
}

/**
 * Generic final-result embed shown after all processing is complete.
 *
 * Colour logic:
 *  - green  — every processed item succeeded
 *  - red    — every processed item failed
 *  - orange — mixed results
 *  - grey   — nothing was processed
 */
export function buildResultEmbed(params: {
	groups: ResultGroup[];
	skipped?: string[];
	footer?: string;
}): EmbedBuilder {
	const { groups, skipped = [], footer } = params;

	const activeGroups = groups.filter((g) => g.items.length > 0);
	const totalSucceeded = activeGroups
		.filter((g) => !g.isFailed)
		.reduce((sum, g) => sum + g.items.length, 0);
	const totalFailed = activeGroups
		.filter((g) => g.isFailed)
		.reduce((sum, g) => sum + g.items.length, 0);
	const totalProcessed = totalSucceeded + totalFailed;

	const [title, color] =
		totalProcessed === 0
			? (["📋 No Changes Applied", 0x95a5a6] as const)
			: totalFailed === 0
				? (["✅ All Changes Applied", 0x2ecc71] as const)
				: totalSucceeded === 0
					? (["❌ All Changes Failed", 0xe74c3c] as const)
					: (["⚠️ Partial Success", 0xf39c12] as const);

	const embed = new EmbedBuilder()
		.setTitle(title)
		.setColor(color)
		.setDescription(buildProgressBar(totalSucceeded, totalProcessed || 1))
		.setTimestamp();

	for (const group of activeGroups) {
		embed.addFields({
			name: `${group.icon} ${group.label} (${group.items.length})`,
			value: truncateList(group.items),
		});
	}

	if (skipped.length > 0) {
		embed.addFields({
			name: `⏭️ Skipped (${skipped.length})`,
			value: truncateList(skipped),
		});
	}

	if (footer) embed.setFooter({ text: footer });

	return embed;
}

// ─── sendSelectableActionMessage ─────────────────────────────────────────────

export interface SelectableActionOptions<TItem, TAction extends string> {
	/** Parent interaction — a followUp will be sent on it. */
	interaction: ChatInputCommandInteraction | MessageComponentInteraction;

	/** All items to display and act upon. */
	items: TItem[];

	/**
	 * Returns a stable, unique string key for each item.
	 * Used as the select-menu option value.
	 */
	getItemId: (item: TItem) => string;

	/** Definition of every possible action. */
	actions: Record<TAction, ActionDef>;

	/** Returns the initial action assigned to an item. */
	initialAction: (item: TItem) => TAction;

	/**
	 * Returns the next action when the user toggles an item in the select menu.
	 * Called with the item and its current action; must return the new action.
	 */
	cycleAction: (item: TItem, current: TAction) => TAction;

	/** Title shown in the selection embed. */
	selectionTitle: string;

	/**
	 * Optional description for the selection embed.
	 * Receives the current counts per action so it can show live totals.
	 */
	selectionDescription?: (counts: Record<TAction, number>) => string;

	/** Formats one item as an embed field (shown in the selection embed). */
	formatField: (
		item: TItem,
		action: TAction,
	) => { name: string; value: string };

	/** Formats one item as a select-menu option. */
	formatOption: (
		item: TItem,
		action: TAction,
	) => { label: string; description?: string };

	/**
	 * Builds the Apply button label given the current action counts.
	 * Defaults to `"Apply (N)"` / `"Nothing to Apply"`.
	 */
	applyLabel?: (counts: Record<TAction, number>) => string;

	/**
	 * Processes one item.
	 * Resolve `true` on success, `false` (or throw) on failure.
	 */
	process: (item: TItem, action: TAction) => Promise<boolean>;

	/** The `value` text shown for each item in the progress embed. */
	formatProgressValue: (item: TItem, action: TAction) => string;

	/** The entry string for each item in the result embed lists. */
	formatResultEntry: (item: TItem, action: TAction) => string;

	/**
	 * Footer shown in the result embed when at least one item succeeded.
	 * Pass a function to vary the text based on which actions succeeded.
	 */
	resultFooter?:
		| string
		| ((
				succeeded: Map<TAction, TItem[]>,
				failed: TItem[],
		  ) => string | null);

	/** Whether the followUp is ephemeral. Default: `true`. */
	ephemeral?: boolean;

	/** Collector timeout in ms. Default: 15 minutes. */
	timeout?: number;

	/** Accent colour of the selection embed. Default: `0xf39c12` (orange). */
	selectionColor?: number;

	/** Title of the in-progress embed. Default: `"⚙️ Applying Changes"`. */
	progressTitle?: string;

	/**
	 * Called right after the user clicks Apply, with the full list of
	 * items-to-process and the live message, but BEFORE the first
	 * `process()` call or the progress embed is shown.
	 *
	 * Use this to implement permission gates, staff-approval flows, etc.
	 * You may freely edit `msg` inside this hook.
	 *
	 * Return `true` to proceed with processing, or `false` to abort.
	 * When `false` is returned the helper resolves immediately — make sure
	 * `msg` is left in a reasonable state before returning.
	 */
	onBeforeProcess?: (
		toProcess: { item: TItem; action: TAction }[],
		msg: Message,
	) => Promise<boolean>;
}

/**
 * Sends an ephemeral followUp message that lets the user cycle a per-item
 * action via a select menu, then apply or cancel the batch operation.
 *
 * Lifecycle:
 *  1. Selection embed + select menu + Apply/Cancel buttons.
 *  2. User toggles items (select menu cycles each item's action).
 *  3. User clicks Apply → live progress embed → result embed.
 *  4. User clicks Cancel, or the timeout fires → message cleaned up.
 *
 * The returned Promise resolves when the interaction is fully settled
 * (apply complete, cancelled, or timed out).
 */
export async function sendSelectableActionMessage<
	TItem,
	TAction extends string,
>(options: SelectableActionOptions<TItem, TAction>): Promise<void> {
	const {
		interaction,
		items,
		getItemId,
		actions,
		initialAction,
		cycleAction,
		selectionTitle,
		selectionDescription,
		formatField,
		formatOption,
		applyLabel,
		process,
		formatProgressValue,
		formatResultEntry,
		resultFooter,
		ephemeral = true,
		timeout = 15 * 60 * 1000,
		selectionColor = 0xf39c12,
		progressTitle,
		onBeforeProcess,
	} = options;

	const actionKeys = Object.keys(actions) as TAction[];

	// ── State ─────────────────────────────────────────────────────────────────

	const actionMap = new Map<string, TAction>(
		items.map((item) => [getItemId(item), initialAction(item)]),
	);

	const getCounts = (): Record<TAction, number> => {
		const counts = Object.fromEntries(
			actionKeys.map((k) => [k, 0]),
		) as Record<TAction, number>;
		for (const action of actionMap.values()) counts[action]++;
		return counts;
	};

	const getActiveTotal = (counts: Record<TAction, number>): number =>
		actionKeys
			.filter((k) => actions[k].isActive)
			.reduce((sum, k) => sum + counts[k], 0);

	// ── Component builders ────────────────────────────────────────────────────

	const buildSelectionEmbed = (): EmbedBuilder => {
		const counts = getCounts();
		const embed = new EmbedBuilder()
			.setTitle(selectionTitle)
			.setColor(selectionColor);

		if (selectionDescription) {
			embed.setDescription(selectionDescription(counts));
		}

		for (const item of items.slice(0, 25)) {
			const action = actionMap.get(getItemId(item)) ?? actionKeys[0]!;
			const { name, value } = formatField(item, action);
			embed.addFields({
				name: name.slice(0, 256),
				value,
				inline: true,
			});
		}

		const overflow = items.length - 25;
		if (overflow > 0) {
			embed.setFooter({
				text: `… and ${overflow} more (not shown in menu)`,
			});
		}

		return embed;
	};

	const buildSelectRow =
		(): ActionRowBuilder<MessageActionRowComponentBuilder>[] => {
			const opts = items.slice(0, MAX_SELECT_OPTIONS).map((item) => {
				const action = actionMap.get(getItemId(item)) ?? actionKeys[0]!;
				const { label, description } = formatOption(item, action);
				const opt = new StringSelectMenuOptionBuilder()
					.setLabel(trimTextWithSuffix(label, 100))
					.setValue(getItemId(item));
				if (description)
					opt.setDescription(trimTextWithSuffix(description, 100));
				return opt;
			});

			return [
				new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
					new StringSelectMenuBuilder()
						.setCustomId(SELECT_ID)
						.setPlaceholder("Select items to cycle their action…")
						.setMinValues(1)
						.setMaxValues(opts.length)
						.addOptions(opts),
				),
			];
		};

	const buildButtonRow =
		(): ActionRowBuilder<MessageActionRowComponentBuilder>[] => {
			const counts = getCounts();
			const total = getActiveTotal(counts);

			const label = applyLabel
				? applyLabel(counts)
				: total > 0
					? `Apply (${total})`
					: "Nothing to Apply";

			return [
				new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId(APPLY_ID)
						.setLabel(label)
						.setStyle(ButtonStyle.Success)
						.setDisabled(total === 0),
					new ButtonBuilder()
						.setCustomId(CANCEL_ID)
						.setLabel("Cancel")
						.setStyle(ButtonStyle.Secondary),
				),
			];
		};

	// ── Send the initial selection message ────────────────────────────────────

	const msg = await interaction.followUp({
		embeds: [buildSelectionEmbed()],
		components: [...buildSelectRow(), ...buildButtonRow()],
		...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
	});

	// ── Collectors ────────────────────────────────────────────────────────────

	const userFilter = (i: { user: { id: string } }) =>
		i.user.id === interaction.user.id;

	const selectCollector = msg.createMessageComponentCollector({
		componentType: ComponentType.StringSelect,
		filter: userFilter,
		time: timeout,
	});

	await new Promise<void>((resolve) => {
		selectCollector.on("collect", async (i) => {
			if (i.customId !== SELECT_ID) return;
			await i.deferUpdate();

			for (const id of i.values) {
				const item = items.find((it) => getItemId(it) === id);
				if (!item) continue;
				const current = actionMap.get(id) ?? actionKeys[0]!;
				actionMap.set(id, cycleAction(item, current));
			}

			await msg
				.edit({
					embeds: [buildSelectionEmbed()],
					components: [...buildSelectRow(), ...buildButtonRow()],
				})
				.catch(() => {});
		});

		const btnCollector = msg.createMessageComponentCollector({
			componentType: ComponentType.Button,
			filter: userFilter,
			time: timeout,
		});

		btnCollector.on("collect", async (i) => {
			// ── Cancel ────────────────────────────────────────────────────
			if (i.customId === CANCEL_ID) {
				selectCollector.stop();
				btnCollector.stop();
				await i
					.update({
						content: "Cancelled.",
						embeds: [],
						components: [],
					})
					.catch(() => {});
				resolve();
				return;
			}

			if (i.customId !== APPLY_ID) return;

			// ── Apply ─────────────────────────────────────────────────────
			await i.deferUpdate().catch(() => {});
			selectCollector.stop();
			btnCollector.stop();

			const toProcess = items
				.filter((item) => {
					const action = actionMap.get(getItemId(item));
					return action !== undefined && actions[action].isActive;
				})
				.map((item) => ({
					item,
					action: actionMap.get(getItemId(item))! as TAction,
				}));

			if (toProcess.length === 0) {
				await msg
					.edit({
						content: "No actions to apply.",
						embeds: [],
						components: [],
					})
					.catch(() => {});
				resolve();
				return;
			}

			// ── Pre-process gate (e.g. permission / approval check) ───────
			if (onBeforeProcess) {
				const proceed = await onBeforeProcess(toProcess, msg).catch(
					() => false,
				);
				if (!proceed) {
					resolve();
					return;
				}
			}

			// Initialise statuses and show the first progress embed
			const statuses = new Map<string, ItemStatus>(
				toProcess.map(({ item }) => [getItemId(item), "pending"]),
			);
			let completed = 0;

			const getEntries = () =>
				toProcess.map(({ item, action }) => ({
					name: formatField(item, action)
						.name.replace(/^[\p{Emoji}\s]+/u, "")
						.trim(),
					value: formatProgressValue(item, action),
					status: statuses.get(getItemId(item)) ?? "pending",
				}));

			await msg
				.edit({
					embeds: [
						buildProgressEmbed({
							title: progressTitle,
							entries: getEntries(),
							completed,
							total: toProcess.length,
						}),
					],
					components: [],
				})
				.catch(() => {});

			// Collect results by action
			const succeeded = new Map<TAction, TItem[]>(
				actionKeys.map((k) => [k, []]),
			);
			const failed: TItem[] = [];

			for (const { item, action } of toProcess) {
				const id = getItemId(item);
				statuses.set(id, "processing");

				await msg
					.edit({
						embeds: [
							buildProgressEmbed({
								title: progressTitle,
								entries: getEntries(),
								completed,
								total: toProcess.length,
							}),
						],
					})
					.catch(() => {});

				const ok = await process(item, action).catch(() => false);

				statuses.set(id, ok ? "success" : "failed");
				if (ok) {
					succeeded.get(action)!.push(item);
				} else {
					failed.push(item);
				}
				completed++;

				await msg
					.edit({
						embeds: [
							buildProgressEmbed({
								title: progressTitle,
								entries: getEntries(),
								completed,
								total: toProcess.length,
							}),
						],
					})
					.catch(() => {});
			}

			// Build result groups (one per action that had successes)
			const groups: ResultGroup[] = [];
			for (const [action, succItems] of succeeded) {
				if (succItems.length > 0) {
					const def = actions[action];
					groups.push({
						icon: def.icon,
						label: `${def.label} succeeded`,
						items: succItems.map((item) =>
							formatResultEntry(item, action),
						),
					});
				}
			}
			if (failed.length > 0) {
				groups.push({
					icon: "❌",
					label: "Failed",
					items: failed.map((item) => {
						const action =
							actionMap.get(getItemId(item)) ?? actionKeys[0]!;
						return formatResultEntry(item, action);
					}),
					isFailed: true,
				});
			}

			const skippedItems = items.filter(
				(item) =>
					!actions[actionMap.get(getItemId(item)) ?? actionKeys[0]!]
						.isActive,
			);
			const skippedStrings = skippedItems.map((item) => {
				const action = actionMap.get(getItemId(item)) ?? actionKeys[0]!;
				return formatResultEntry(item, action);
			});

			const totalSucceeded = [...succeeded.values()].reduce(
				(sum, arr) => sum + arr.length,
				0,
			);
			const footer = resultFooter
				? typeof resultFooter === "function"
					? (resultFooter(succeeded, failed) ?? undefined)
					: totalSucceeded > 0
						? resultFooter
						: undefined
				: undefined;

			await msg
				.edit({
					embeds: [
						buildResultEmbed({
							groups,
							skipped: skippedStrings,
							footer,
						}),
					],
				})
				.catch(() => {});

			resolve();
		});

		// On timeout, strip the interactive components and resolve.
		btnCollector.on("end", (_c, reason) => {
			if (reason === "time") {
				msg.edit({ components: [] }).catch(() => {});
				resolve();
			}
		});
	});
}
