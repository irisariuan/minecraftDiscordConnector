import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	inlineCode,
	LabelBuilder,
	ModalBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ChatInputCommandInteraction,
} from "discord.js";

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum PhasedInputAction {
	FILL = "pi_fill",
	FILL_TEXTS = "pi_filltexts",
	BACK = "pi_back",
	NEXT = "pi_next",
	CANCEL = "pi_cancel",
}

const MODAL_CUSTOM_ID = "pi_modal";
const SELECT_PREFIX = "pi_sel_";
const PAGE_PREV_PREFIX = "pi_page_prev_";
const PAGE_NEXT_PREFIX = "pi_page_next_";
const PAGE_SIZE = 25;

// ─── Public Interfaces ────────────────────────────────────────────────────────

export interface PhasedSelectOption {
	label: string;
	value: string;
	description?: string;
}

export interface PhasedField {
	/** Unique ID — used as the component customId and the key in PhasedValues */
	id: string;
	/** Short label shown inside the LabelBuilder or select menu */
	label: string;
	/** Optional description shown beneath the label */
	description?: string;
	/**
	 * Whether this field is rendered as a dropdown select menu or a text input
	 * inside a modal. Defaults to `"text"`.
	 */
	type?: "text" | "select";
	/**
	 * Static option list for `type: "select"` fields.
	 * Use `loadOptions` instead when the list depends on other field values.
	 */
	selectOptions?: PhasedSelectOption[];
	/**
	 * Async callback that dynamically loads options for a `type: "select"` field.
	 * Called whenever any select in the same phase changes and when the phase is
	 * first entered. Takes precedence over `selectOptions` when both are set.
	 *
	 * @example
	 * loadOptions: (values) => fetchVersionOptionsForLoader(values.loaderType ?? "")
	 */
	loadOptions?: (
		values: PhasedValues,
	) => Promise<PhasedSelectOption[]> | PhasedSelectOption[];
	// ── Text-type only ────────────────────────────────────────────────────────
	style?: TextInputStyle;
	/** Defaults to true */
	required?: boolean;
	placeholder?: string;
	maxLength?: number;
	/** Pre-filled value the first time this phase's modal is opened */
	defaultValue?: string;
}

export interface PhasedPhase {
	/** Short name shown in the step-indicator line */
	label: string;
	/** Longer description shown in the embed while this phase is active */
	description?: string;
	/**
	 * The fields to collect.
	 * Select fields are unlimited; text fields are limited to 5 per Discord modal.
	 */
	fields: PhasedField[];
	/**
	 * Optional validation run after all fields in the phase are confirmed.
	 * May be synchronous or asynchronous.
	 * Return an error string to reject the values, or null to accept.
	 */
	validate?: (values: PhasedValues) => Promise<string | null> | string | null;
}

/** fieldId → collected string value for a single phase */
export type PhasedValues = Record<string, string>;

export interface PhasedInputOptions {
	interaction: ChatInputCommandInteraction;
	/** Embed title shown throughout the wizard */
	title: string;
	phases: PhasedPhase[];
	/** Collector timeout in ms (default: 10 minutes) */
	timeout?: number;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function getSelectFields(phase: PhasedPhase): PhasedField[] {
	return phase.fields.filter((f) => f.type === "select");
}

function getTextFields(phase: PhasedPhase): PhasedField[] {
	return phase.fields.filter((f) => f.type !== "select");
}

function isPhaseComplete(phase: PhasedPhase, values: PhasedValues): boolean {
	return phase.fields
		.filter((f) => f.required !== false)
		.every((f) => !!values[f.id]?.trim());
}

function buildProgressEmbed(
	title: string,
	phases: PhasedPhase[],
	collected: (PhasedValues | null)[],
	partialValues: PhasedValues[],
	currentPhase: number,
	errorMessage?: string | null,
): EmbedBuilder {
	const allFilled = collected.every((v) => v !== null);
	const currentPhaseDef = phases[currentPhase]!;
	const isFilled = collected[currentPhase] !== null;
	const currentPartial = partialValues[currentPhase] ?? {};

	const stepIndicator = phases
		.map((phase, i) => {
			const icon =
				i < currentPhase ? "✅" : i === currentPhase ? "🔵" : "⚪";
			return `${icon} ${phase.label}`;
		})
		.join("  ▸  ");

	const descLines: string[] = [
		stepIndicator,
		"",
		`**${currentPhaseDef.label}**`,
	];

	if (currentPhaseDef.description) {
		descLines.push(currentPhaseDef.description);
	}

	const selectFields = getSelectFields(currentPhaseDef);
	const textFields = getTextFields(currentPhaseDef);

	if (!isFilled) {
		if (selectFields.length > 0) {
			descLines.push(
				"",
				"Use the dropdowns below to make your selections.",
			);
			if (textFields.length > 0) {
				descLines.push(
					"Then click **✏️ Fill Text Fields** for the remaining inputs.",
				);
			}
		} else {
			descLines.push("", "Click **✏️ Fill Step** to continue.");
		}
	}

	if (errorMessage) {
		descLines.push("", `❌ ${errorMessage}`);
	}

	const description = descLines
		.reduce<string[]>((acc, line) => {
			if (line === "" && acc.at(-1) === "") return acc;
			acc.push(line);
			return acc;
		}, [])
		.join("\n");

	const embed = new EmbedBuilder()
		.setTitle(title)
		.setDescription(description)
		.setColor(allFilled ? "Green" : "Gold")
		.setFooter({ text: `Step ${currentPhase + 1} of ${phases.length}` });

	// Show completed phases as embed fields; for the current phase show partial
	// values if any selections have been made
	for (let i = 0; i <= currentPhase; i++) {
		const phase = phases[i];
		const values =
			i === currentPhase && !collected[i] ? currentPartial : collected[i];
		if (!phase || !values || Object.keys(values).length === 0) continue;

		const icon = i < currentPhase ? "✅" : "🔵";
		const fieldValue =
			phase.fields
				.map((f) => {
					const val = values[f.id];
					return `**${f.label}:** ${val ? inlineCode(val) : "_not set_"}`;
				})
				.join("\n") || "(no values)";

		embed.addFields({ name: `${icon} ${phase.label}`, value: fieldValue });
	}

	return embed;
}

type PhaseRow = ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>;

function buildPhaseComponents(
	phase: PhasedPhase,
	currentPhase: number,
	totalPhases: number,
	collected: (PhasedValues | null)[],
	partialValues: PhasedValues[],
	dynamicOptions: Record<string, PhasedSelectOption[] | undefined>,
	loadingFields: Set<string>,
	fieldPages: Record<string, number>,
): PhaseRow[] {
	const rows: PhaseRow[] = [];
	const partial = partialValues[currentPhase] ?? {};
	const isFilled = collected[currentPhase] !== null;
	const isLast = currentPhase === totalPhases - 1;

	const selectFields = getSelectFields(phase);
	const textFields = getTextFields(phase);
	const hasSelectFields = selectFields.length > 0;
	const allRequiredFilled = isPhaseComplete(phase, partial);

	// ── Pagination row budget: max 5 rows total minus 1 for nav and 1 per select field ──
	const paginationBudget = Math.max(0, 4 - selectFields.length);
	let paginationRowsUsed = 0;

	// ── Select menu rows (one per select field) ────────────────────────────
	for (const field of selectFields) {
		const currentValue = partial[field.id];
		const isLoading = loadingFields.has(field.id);

		let options: PhasedSelectOption[];
		let disabled = false;
		let placeholder: string;

		if (isLoading) {
			// API call in flight
			options = [{ label: "⌛ Loading options…", value: "__loading__" }];
			disabled = true;
			placeholder = "⌛ Loading options…";
		} else if (field.loadOptions !== undefined) {
			// Dynamic field — use whatever has been fetched so far
			const loaded = dynamicOptions[field.id];
			if (loaded === undefined) {
				// Fetch not yet started (will be triggered by refreshDynamicOptions)
				options = [
					{ label: "⌛ Loading options…", value: "__loading__" },
				];
				disabled = true;
				placeholder = "⌛ Loading options…";
			} else if (loaded.length === 0) {
				options = [
					{ label: "No options available", value: "__none__" },
				];
				disabled = true;
				placeholder = "No options available";
			} else {
				options = loaded;
				placeholder = field.placeholder ?? `Select ${field.label}…`;
			}
		} else {
			// Static options list
			options = field.selectOptions ?? [];
			placeholder = field.placeholder ?? `Select ${field.label}…`;
		}

		// ── Pagination: slice the full option list to the current page ─────
		const totalPages = disabled ? 1 : Math.ceil(options.length / PAGE_SIZE);
		const page = Math.min(
			fieldPages[field.id] ?? 0,
			Math.max(0, totalPages - 1),
		);
		const pageOptions = disabled
			? options
			: options.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

		const optionBuilders = pageOptions.map((opt) => {
			const builder = new StringSelectMenuOptionBuilder()
				.setLabel(opt.label)
				.setValue(opt.value);
			if (opt.description) builder.setDescription(opt.description);
			// Only mark default when the menu is interactive (not a placeholder)
			if (!disabled && currentValue === opt.value)
				builder.setDefault(true);
			return builder;
		});

		const menu = new StringSelectMenuBuilder()
			.setCustomId(`${SELECT_PREFIX}${field.id}`)
			.setPlaceholder(placeholder)
			.setDisabled(disabled)
			.addOptions(optionBuilders);

		rows.push(
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
		);

		// ── Pagination controls (only when multiple pages exist and budget allows) ──
		if (
			!disabled &&
			totalPages > 1 &&
			paginationRowsUsed < paginationBudget
		) {
			rows.push(
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId(`${PAGE_PREV_PREFIX}${field.id}`)
						.setLabel("◀ Prev")
						.setStyle(ButtonStyle.Secondary)
						.setDisabled(page === 0),
					new ButtonBuilder()
						.setCustomId(`pi_page_info_${field.id}`)
						.setLabel(`Page ${page + 1} / ${totalPages}`)
						.setStyle(ButtonStyle.Secondary)
						.setDisabled(true),
					new ButtonBuilder()
						.setCustomId(`${PAGE_NEXT_PREFIX}${field.id}`)
						.setLabel("Next ▶")
						.setStyle(ButtonStyle.Secondary)
						.setDisabled(page >= totalPages - 1),
				),
			);
			paginationRowsUsed++;
		}
	}

	// ── Navigation / action buttons ────────────────────────────────────────
	const navRow = new ActionRowBuilder<ButtonBuilder>();

	if (!hasSelectFields) {
		// Text-only phase — original behaviour
		if (!isFilled) {
			navRow.addComponents(
				new ButtonBuilder()
					.setCustomId(PhasedInputAction.BACK)
					.setLabel("◀ Back")
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(currentPhase === 0),
				new ButtonBuilder()
					.setCustomId(PhasedInputAction.FILL)
					.setLabel("✏️ Fill Step")
					.setStyle(ButtonStyle.Primary),
				new ButtonBuilder()
					.setCustomId(PhasedInputAction.CANCEL)
					.setLabel("❌ Cancel")
					.setStyle(ButtonStyle.Secondary),
			);
		} else {
			navRow.addComponents(
				new ButtonBuilder()
					.setCustomId(PhasedInputAction.BACK)
					.setLabel("◀ Back")
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(currentPhase === 0),
				new ButtonBuilder()
					.setCustomId(PhasedInputAction.FILL)
					.setLabel("✏️ Edit")
					.setStyle(ButtonStyle.Secondary),
				new ButtonBuilder()
					.setCustomId(PhasedInputAction.NEXT)
					.setLabel(isLast ? "✅ Review" : "▶ Next")
					.setStyle(
						isLast ? ButtonStyle.Success : ButtonStyle.Primary,
					),
				new ButtonBuilder()
					.setCustomId(PhasedInputAction.CANCEL)
					.setLabel("❌ Cancel")
					.setStyle(ButtonStyle.Danger),
			);
		}
	} else {
		// Select (or mixed select+text) phase
		navRow.addComponents(
			new ButtonBuilder()
				.setCustomId(PhasedInputAction.BACK)
				.setLabel("◀ Back")
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(currentPhase === 0),
		);

		if (textFields.length > 0) {
			navRow.addComponents(
				new ButtonBuilder()
					.setCustomId(PhasedInputAction.FILL_TEXTS)
					.setLabel("✏️ Fill Text Fields")
					.setStyle(ButtonStyle.Primary),
			);
		}

		navRow.addComponents(
			new ButtonBuilder()
				.setCustomId(PhasedInputAction.NEXT)
				.setLabel(isLast ? "✅ Confirm & Review" : "✅ Confirm & Next")
				.setStyle(
					allRequiredFilled
						? ButtonStyle.Success
						: ButtonStyle.Secondary,
				)
				.setDisabled(!allRequiredFilled),
			new ButtonBuilder()
				.setCustomId(PhasedInputAction.CANCEL)
				.setLabel("❌ Cancel")
				.setStyle(ButtonStyle.Danger),
		);
	}

	rows.push(navRow);
	return rows;
}

function buildTextFieldsModal(
	phase: PhasedPhase,
	currentValues?: PhasedValues,
): ModalBuilder {
	const textFields = getTextFields(phase);
	const modal = new ModalBuilder()
		.setCustomId(MODAL_CUSTOM_ID)
		.setTitle(phase.label.slice(0, 45));

	for (const field of textFields) {
		const input = new TextInputBuilder()
			.setCustomId(field.id)
			.setStyle(field.style ?? TextInputStyle.Short)
			.setRequired(field.required ?? true);

		if (field.maxLength) input.setMaxLength(field.maxLength);
		if (field.placeholder) input.setPlaceholder(field.placeholder);

		const value = currentValues?.[field.id] ?? field.defaultValue;
		if (value) input.setValue(value);

		const labelBuilder = new LabelBuilder()
			.setLabel(field.label.slice(0, 45))
			.setTextInputComponent(input);

		if (field.description) labelBuilder.setDescription(field.description);

		modal.addLabelComponents(labelBuilder);
	}

	return modal;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Runs a multi-step wizard.
 *
 * Each phase shows a progress embed. Phases may contain:
 *  - **Text fields** (`type: "text"` or omitted): collected via a Discord modal
 *    opened when the user clicks **Fill Step** / **Fill Text Fields**.
 *  - **Static select fields** (`type: "select"` + `selectOptions`): rendered as
 *    inline `StringSelectMenu` dropdowns directly on the message.
 *  - **Dynamic select fields** (`type: "select"` + `loadOptions`): same as
 *    above, but options are fetched from an async callback whenever any select
 *    in the phase changes (e.g. version list that updates when the loader
 *    changes). A disabled "⌛ Loading" menu is shown while fetching. A
 *    generation counter ensures stale responses from rapid changes are discarded.
 *
 * Phases may freely mix all three field types.
 *
 * @returns An array of per-phase value maps (index mirrors the `phases` array),
 *          or `null` if the user cancels / the collector times out.
 */
export async function runPhasedInput(
	options: PhasedInputOptions,
): Promise<PhasedValues[] | null> {
	const { interaction, title, phases, timeout = 1000 * 60 * 10 } = options;

	let currentPhase = 0;
	const collected: (PhasedValues | null)[] = phases.map(() => null);
	/** In-progress values for each phase; accumulates select picks + text inputs */
	const partialValues: PhasedValues[] = phases.map(() => ({}));
	/** Dynamically fetched options per field id. `undefined` = not fetched yet */
	const dynamicOptions: Record<string, PhasedSelectOption[] | undefined> = {};
	/** Field ids whose `loadOptions` call is currently in flight */
	const loadingFields = new Set<string>();
	/**
	 * Per-field generation counter. Incremented each time a refresh is
	 * triggered so that an older in-flight response can be identified and
	 * discarded if a newer request has already started.
	 */
	const optionGeneration: Record<string, number> = {};
	/** Current page index (0-based) for each paginated select field */
	const fieldPages: Record<string, number> = {};
	let errorMessage: string | null = null;

	const render = () =>
		interaction.editReply({
			content: "",
			embeds: [
				buildProgressEmbed(
					title,
					phases,
					collected,
					partialValues,
					currentPhase,
					errorMessage,
				),
			],
			// Cast needed because editReply's generic doesn't know our union row type
			components: buildPhaseComponents(
				phases[currentPhase]!,
				currentPhase,
				phases.length,
				collected,
				partialValues,
				dynamicOptions,
				loadingFields,
				fieldPages,
			) as ActionRowBuilder<ButtonBuilder>[],
		});

	/**
	 * (Re-)loads dynamic options for every `loadOptions` field in `phaseIndex`.
	 * Always triggers at least one `render()` call — either to show the loading
	 * spinners (when there are dynamic fields) or to refresh the embed after a
	 * navigation event (when there are none).
	 *
	 * Uses a per-field generation counter so that a stale response arriving
	 * after the user has already changed their selection is silently discarded.
	 */
	async function refreshDynamicOptions(phaseIndex: number): Promise<void> {
		const phaseDef = phases[phaseIndex];
		if (!phaseDef) return;

		const fieldsToLoad = phaseDef.fields.filter((f) => f.loadOptions);

		// Nothing dynamic in this phase — just re-render and return
		if (fieldsToLoad.length === 0) {
			await render();
			return;
		}

		const partial = { ...(partialValues[phaseIndex] ?? {}) };

		// Bump the generation counter and mark every field as loading
		const gens: Record<string, number> = {};
		for (const f of fieldsToLoad) {
			const gen = (optionGeneration[f.id] ?? 0) + 1;
			optionGeneration[f.id] = gen;
			gens[f.id] = gen;
			loadingFields.add(f.id);
		}

		await render(); // Show loading spinners immediately

		await Promise.all(
			fieldsToLoad.map(async (f) => {
				try {
					const loaded = await f.loadOptions!(partial);

					// Discard if a newer request was already started for this field
					if (optionGeneration[f.id] !== gens[f.id]) return;

					dynamicOptions[f.id] = loaded;
					loadingFields.delete(f.id);
					fieldPages[f.id] = 0; // Reset to page 1 whenever the option list changes

					// If the previously selected value is no longer in the new list,
					// clear it so the user has to make a fresh choice
					const currentVal = (partialValues[phaseIndex] ?? {})[f.id];
					if (
						currentVal &&
						!loaded.some((o) => o.value === currentVal)
					) {
						delete (partialValues[phaseIndex] ?? {})[f.id];
					}
				} catch {
					if (optionGeneration[f.id] !== gens[f.id]) return;
					dynamicOptions[f.id] = [];
					loadingFields.delete(f.id);
				}
			}),
		);

		await render(); // Show the loaded options (or empty/error state)
	}

	const message = await render();

	return new Promise((resolve) => {
		// No componentType filter — we need to collect both buttons AND select menus
		const collector = message.createMessageComponentCollector({
			filter: (i) => i.user.id === interaction.user.id,
			time: timeout,
		});

		// Kick off the initial option load for any dynamic fields in the first phase
		void refreshDynamicOptions(currentPhase);

		collector.on("collect", async (i) => {
			errorMessage = null;

			// ── Page navigation buttons ───────────────────────────────────────
			if (
				i.isButton() &&
				(i.customId.startsWith(PAGE_PREV_PREFIX) ||
					i.customId.startsWith(PAGE_NEXT_PREFIX))
			) {
				await i.deferUpdate();
				const isNext = i.customId.startsWith(PAGE_NEXT_PREFIX);
				const fieldId = isNext
					? i.customId.slice(PAGE_NEXT_PREFIX.length)
					: i.customId.slice(PAGE_PREV_PREFIX.length);
				const field = phases[currentPhase]!.fields.find(
					(f) => f.id === fieldId,
				);
				if (!field) return;

				const allOptions = field.loadOptions
					? (dynamicOptions[fieldId] ?? [])
					: (field.selectOptions ?? []);
				const totalPages = Math.ceil(allOptions.length / PAGE_SIZE);
				const currentPage = fieldPages[fieldId] ?? 0;

				fieldPages[fieldId] = isNext
					? Math.min(currentPage + 1, totalPages - 1)
					: Math.max(currentPage - 1, 0);

				await render();
				return;
			}

			// ── String Select Menu ────────────────────────────────────────────
			if (
				i.isStringSelectMenu() &&
				i.customId.startsWith(SELECT_PREFIX)
			) {
				// Reject interactions with the loading/empty placeholder options
				if (
					i.values[0] === "__loading__" ||
					i.values[0] === "__none__"
				) {
					await i.deferUpdate();
					return;
				}

				await i.deferUpdate();
				const fieldId = i.customId.slice(SELECT_PREFIX.length);
				(partialValues[currentPhase] ??= {})[fieldId] = i.values[0]!;

				// If any other field in this phase has loadOptions, its options may
				// depend on the value we just set — reload them all
				const phaseDef = phases[currentPhase]!;
				const hasLoadOptionsDependents = phaseDef.fields.some(
					(f) => f.loadOptions && f.id !== fieldId,
				);

				if (hasLoadOptionsDependents) {
					void refreshDynamicOptions(currentPhase);
				} else {
					await render();
				}
				return;
			}

			if (!i.isButton()) return;

			switch (i.customId) {
				// ── Fill / Edit (text-only phase) ─────────────────────────
				case PhasedInputAction.FILL: {
					const phase = phases[currentPhase]!;
					await i.showModal(
						buildTextFieldsModal(
							phase,
							collected[currentPhase] ??
								partialValues[currentPhase] ??
								undefined,
						),
					);

					const submit = await i
						.awaitModalSubmit({
							time: 1000 * 60 * 5,
							filter: (mi) =>
								mi.user.id === i.user.id &&
								mi.customId === MODAL_CUSTOM_ID,
						})
						.catch(() => null);

					if (!submit) return;
					await submit.deferUpdate();

					// Collect text field values on top of any existing partial values
					const values: PhasedValues = {
						...partialValues[currentPhase],
					};
					for (const field of getTextFields(phase)) {
						values[field.id] = submit.fields
							.getTextInputValue(field.id)
							.trim();
					}

					if (phase.validate) {
						const validationCall = phase.validate(values);
						if (validationCall instanceof Promise) {
							await interaction.editReply({
								content: "⌛ Validating…",
								embeds: [],
								components: [],
							});
						}
						const error = await validationCall;
						if (error) {
							errorMessage = error;
							// Keep partial values so the user doesn't have to re-pick selects
							partialValues[currentPhase] = values;
							await render();
							return;
						}
					}

					collected[currentPhase] = values;
					partialValues[currentPhase] = values;
					await render();
					break;
				}

				// ── Fill Text Fields (mixed select+text phase) ────────────
				case PhasedInputAction.FILL_TEXTS: {
					const phase = phases[currentPhase]!;
					await i.showModal(
						buildTextFieldsModal(
							phase,
							collected[currentPhase] ??
								partialValues[currentPhase] ??
								undefined,
						),
					);

					const submit = await i
						.awaitModalSubmit({
							time: 1000 * 60 * 5,
							filter: (mi) =>
								mi.user.id === i.user.id &&
								mi.customId === MODAL_CUSTOM_ID,
						})
						.catch(() => null);

					if (!submit) return;
					await submit.deferUpdate();

					// Store text values into partial — the user still needs to
					// click "Confirm & Next" to finalise the phase
					for (const field of getTextFields(phase)) {
						(partialValues[currentPhase] ??= {})[field.id] =
							submit.fields.getTextInputValue(field.id).trim();
					}

					await render();
					break;
				}

				// ── Back ──────────────────────────────────────────────────
				case PhasedInputAction.BACK: {
					await i.deferUpdate();
					currentPhase = Math.max(0, currentPhase - 1);
					// Restore partial values from the confirmed state so that select
					// menus show the previously chosen values
					if (collected[currentPhase]) {
						partialValues[currentPhase] = {
							...collected[currentPhase]!,
						};
					}
					// refreshDynamicOptions always renders — covers both the case
					// where the phase has dynamic fields and where it doesn't
					void refreshDynamicOptions(currentPhase);
					break;
				}

				// ── Next / Confirm / Review ───────────────────────────────
				case PhasedInputAction.NEXT: {
					await i.deferUpdate();
					const phase = phases[currentPhase]!;
					const partial = { ...partialValues[currentPhase] };

					// For select (or mixed) phases: validate & confirm here
					if (getSelectFields(phase).length > 0) {
						if (!isPhaseComplete(phase, partial)) {
							errorMessage =
								"Please fill all required fields before continuing.";
							await render();
							return;
						}

						if (phase.validate) {
							const validationCall = phase.validate(partial);
							if (validationCall instanceof Promise) {
								await interaction.editReply({
									content: "⌛ Validating…",
									embeds: [],
									components: [],
								});
							}
							const error = await validationCall;
							if (error) {
								errorMessage = error;
								await render();
								return;
							}
						}

						collected[currentPhase] = partial;
					}

					if (currentPhase < phases.length - 1) {
						currentPhase++;
						// Restore partial from a previously confirmed state if available
						if (collected[currentPhase]) {
							partialValues[currentPhase] = {
								...collected[currentPhase]!,
							};
						}
						// refreshDynamicOptions always renders — loads any dynamic
						// fields for the newly entered phase (or just re-renders)
						void refreshDynamicOptions(currentPhase);
					} else {
						// Last phase — "Review" / "Confirm & Review" was clicked
						collector.stop("complete");
						resolve(collected as PhasedValues[]);
					}
					break;
				}

				// ── Cancel ────────────────────────────────────────────────
				case PhasedInputAction.CANCEL: {
					await i.deferUpdate();
					collector.stop("cancelled");
					break;
				}
			}
		});

		collector.on("end", (_, reason) => {
			if (reason === "complete") return;
			interaction
				.editReply({
					content:
						reason === "cancelled"
							? "❌ Setup cancelled."
							: "⏱️ Setup timed out.",
					embeds: [],
					components: [],
				})
				.catch(() => {});
			resolve(null);
		});
	});
}
