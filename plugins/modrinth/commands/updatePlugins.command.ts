import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	SlashCommandBuilder,
	time,
	type MessageActionRowComponentBuilder,
} from "discord.js";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import type { CommandFile } from "../../../lib/commandFile";
import {
	createRequestComponent,
	RequestComponentId,
	UpdateAction,
} from "../../../lib/component/request";
import { deletePluginRecord, getPluginsByServerId } from "../../../lib/db";
import { sendPaginationMessage } from "../../../lib/pagination";
import {
	comparePermission,
	orPerm,
	PermissionFlags,
	readPermission,
} from "../../../lib/permission";
import { formatFileSize, safeJoin } from "../../../lib/utils";
import {
	downloadPluginFile,
	getPlugin,
	getPluginVersionDetails,
	listPluginVersions,
} from "../lib";
import { type DbPlugin, type RichUpdateEntry } from "../types";

// ─── Phase-3 embed helpers ────────────────────────────────────────────────────

type PluginStatus = "pending" | "downloading" | "success" | "failed";

const STATUS_ICON: Record<PluginStatus, string> = {
	pending: "⬜",
	downloading: "⏳",
	success: "✅",
	failed: "❌",
} as const;

const BAR_WIDTH = 20;

/**
 * Returns a Discord code-block progress bar:
 *   `[████████░░░░░░░░░░░░] 40% (2/5)`
 */
function buildProgressBar(done: number, total: number): string {
	const filled =
		total === 0 ? BAR_WIDTH : Math.round((done / total) * BAR_WIDTH);
	const pct = total === 0 ? 100 : Math.round((done / total) * 100);
	return `\`[${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)}] ${pct}% (${done}/${total})\``;
}

/**
 * Inline field value shown for each plugin in the progress embed.
 * Keeps the text on a single line so the 3-column inline layout stays clean.
 */
function buildPluginFieldValue(
	entry: RichUpdateEntry,
	status: PluginStatus,
): string {
	const ver = `\`${entry.currentVersionNumber}\` → \`${entry.newVersionNumber}\``;
	const size = entry.newFileSize
		? ` · ${formatFileSize(entry.newFileSize)}`
		: "";

	switch (status) {
		case "pending":
			return `${ver}${size}`;
		case "downloading":
			return `${ver}${size} ⬇️`;
		case "success":
			return `${ver} ✅`;
		case "failed":
			return `${ver} ❌`;
	}
}

/**
 * Live progress embed — edited after every download attempt.
 *
 * Layout:
 *  Title  : "⬇️ Downloading Plugin Updates"
 *  Desc   : progress bar
 *  Fields : one inline field per plugin with status icon + version info
 *  Footer : plugin count (or overflow notice when > 25)
 */
function buildProgressEmbed(
	entries: RichUpdateEntry[],
	statuses: Map<string, PluginStatus>,
	completed: number,
): EmbedBuilder {
	const total = entries.length;
	const embed = new EmbedBuilder()
		.setTitle("⬇️ Downloading Plugin Updates")
		.setColor(0x3498db)
		.setDescription(buildProgressBar(completed, total))
		.setTimestamp();

	// Discord caps embeds at 25 fields
	const visible = entries.slice(0, 25);
	for (const entry of visible) {
		const status = statuses.get(entry.plugin.projectId) ?? "pending";
		embed.addFields({
			name: `${STATUS_ICON[status]} ${entry.projectTitle}`.slice(0, 256),
			value: buildPluginFieldValue(entry, status),
			inline: true,
		});
	}

	const overflow = total - visible.length;
	embed.setFooter({
		text:
			overflow > 0
				? `… and ${overflow} more plugin${overflow !== 1 ? "s" : ""} | Updating ${total} total`
				: `Updating ${total} plugin${total !== 1 ? "s" : ""}`,
	});

	return embed;
}

type SuccessEntry = { entry: RichUpdateEntry; filename: string };

/**
 * Truncates a list of strings so the joined result fits within Discord's
 * 1 024-character embed field value limit.
 */
function truncateList(items: string[], separator = "\n"): string {
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

/**
 * Final result embed shown after all downloads finish.
 *
 * Color  : green (all OK) · orange (partial) · red (all failed) · grey (skipped only)
 * Desc   : success-rate progress bar  e.g. `[████░░░░] 50% (2/4)`
 * Fields : Updated · Failed · Skipped · Could-not-check
 * Footer : restart reminder when at least one plugin was updated
 */
function buildResultEmbed(
	successUpdates: SuccessEntry[],
	failedUpdates: RichUpdateEntry[],
	skippedIds: Set<string>,
	allRichUpdates: RichUpdateEntry[],
	failedChecks: string[],
): EmbedBuilder {
	const applied = successUpdates.length + failedUpdates.length;
	const allSucceeded =
		successUpdates.length > 0 && failedUpdates.length === 0;
	const allFailed = successUpdates.length === 0 && applied > 0;
	const noneApplied = applied === 0;

	const [title, color] = noneApplied
		? (["📋 No Updates Applied", 0x95a5a6] as const)
		: allSucceeded
			? (["✅ All Plugins Updated", 0x2ecc71] as const)
			: allFailed
				? (["❌ Updates Failed", 0xe74c3c] as const)
				: (["⚠️ Partial Update", 0xf39c12] as const);

	const embed = new EmbedBuilder()
		.setTitle(title)
		.setColor(color)
		// Bar shows success rate: how many of the attempted ones actually worked
		.setDescription(buildProgressBar(successUpdates.length, applied || 1))
		.setTimestamp();

	if (successUpdates.length > 0) {
		embed.addFields({
			name: `✅ Updated (${successUpdates.length})`,
			value: truncateList(
				successUpdates.map(
					({ entry }) =>
						`**${entry.projectTitle}** \`${entry.currentVersionNumber}\` → \`${entry.newVersionNumber}\``,
				),
			),
		});
	}

	if (failedUpdates.length > 0) {
		embed.addFields({
			name: `❌ Failed to update (${failedUpdates.length})`,
			value: truncateList(
				failedUpdates.map((e) => `**${e.projectTitle}**`),
			),
		});
	}

	if (skippedIds.size > 0) {
		const skipped = allRichUpdates.filter((u) =>
			skippedIds.has(u.plugin.projectId),
		);
		embed.addFields({
			name: `⏭️ Skipped (${skippedIds.size})`,
			value: truncateList(
				skipped.map(
					(e) =>
						`**${e.projectTitle}** \`${e.currentVersionNumber}\` → \`${e.newVersionNumber}\``,
				),
			),
		});
	}

	if (failedChecks.length > 0) {
		embed.addFields({
			name: `⚠️ Could not check (${failedChecks.length})`,
			value: truncateList(failedChecks.map((id) => `\`${id}\``)),
		});
	}

	embed.setFooter({
		text:
			successUpdates.length > 0
				? "🔄 Restart the server for changes to take effect."
				: "No plugins were updated.",
	});

	return embed;
}

// ─── Command ──────────────────────────────────────────────────────────────────

export default {
	command: new SlashCommandBuilder()
		.setName("updateplugins")
		.setDescription(
			"Review and selectively apply updates to plugins tracked in the database",
		),
	requireServer: true,
	async execute({ interaction, server }) {
		// ── Phase 1: gather data ──────────────────────────────────────────────
		await interaction.editReply({
			content: "🔍 Checking for plugin updates — please wait…",
		});

		const plugins = await getPluginsByServerId(server.id);
		if (plugins.length === 0) {
			return await interaction.editReply({
				content:
					"No plugins are tracked in the database for this server.",
			});
		}

		// Keep only the most-recently updated record per projectId
		const latestByProject = new Map<string, DbPlugin>();
		for (const plugin of plugins) {
			const existing = latestByProject.get(plugin.projectId);
			if (!existing || plugin.updatedAt > existing.updatedAt) {
				latestByProject.set(plugin.projectId, plugin);
			}
		}

		const richUpdates: RichUpdateEntry[] = [];
		const failedChecks: string[] = [];

		for (const [projectId, plugin] of latestByProject.entries()) {
			// Fetch everything in parallel to keep things fast
			const [versions, currentVersionDetails, projectDetails] =
				await Promise.all([
					listPluginVersions(projectId, {
						loaders: [server.config.loaderType],
						game_versions: [server.config.minecraftVersion],
					}),
					getPluginVersionDetails(plugin.versionId),
					getPlugin(projectId),
				]);

			if (!versions || versions.length === 0) {
				failedChecks.push(projectId);
				continue;
			}

			const latest = versions[0];
			if (!latest) {
				failedChecks.push(projectId);
				continue;
			}

			// Already up-to-date — skip silently
			if (latest.id === plugin.versionId) continue;

			richUpdates.push({
				plugin,
				projectTitle: projectDetails?.title ?? projectId,
				currentVersionNumber:
					currentVersionDetails?.version_number ?? plugin.versionId,
				currentVersionDate: currentVersionDetails?.date_published
					? new Date(currentVersionDetails.date_published).getTime()
					: null,
				newVersionId: latest.id,
				newVersionNumber: latest.version_number,
				newVersionDate: latest.date_published,
				newFilename: latest.files[0]?.filename ?? "unknown",
				newFileSize: latest.files[0]?.size ?? null,
			});
		}

		if (richUpdates.length === 0) {
			let content = "✅ All tracked plugins are already up to date!";
			if (failedChecks.length > 0) {
				content += `\n\n⚠️ Could not fetch version info for ${failedChecks.length} plugin(s): ${failedChecks.map((id) => `\`${id}\``).join(", ")}`;
			}
			return await interaction.editReply({ content });
		}

		// ── Phase 2: interactive review UI ───────────────────────────────────
		/**
		 * Set of projectIds the user has chosen to SKIP.
		 * Everything NOT in this set will be updated when Apply is clicked.
		 */
		const excludedIds = new Set<string>();

		/** Builds the Apply / Cancel action row, updating the Apply label live. */
		const buildActionRow =
			(): ActionRowBuilder<MessageActionRowComponentBuilder>[] => {
				const pendingCount = richUpdates.length - excludedIds.size;
				const applyBtn = new ButtonBuilder()
					.setCustomId(UpdateAction.Apply)
					.setLabel(
						pendingCount > 0
							? `Apply ${pendingCount} Update${pendingCount !== 1 ? "s" : ""}`
							: "Nothing to Apply",
					)
					.setStyle(ButtonStyle.Success)
					.setDisabled(pendingCount === 0);

				const cancelBtn = new ButtonBuilder()
					.setCustomId(UpdateAction.Cancel)
					.setLabel("Cancel")
					.setStyle(ButtonStyle.Danger);

				return [
					new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
						applyBtn,
						cancelBtn,
					),
				];
			};

		await sendPaginationMessage<RichUpdateEntry>({
			interaction,

			// Return the same pre-computed array every time — no re-fetching.
			getResult: async () => richUpdates,

			// ── Embed field per update entry ──────────────────────────────
			formatter: (u) => {
				const skipped = excludedIds.has(u.plugin.projectId);
				const statusIcon = skipped ? "⏭️" : "✅";

				const currentDateStr = u.currentVersionDate
					? time(new Date(u.currentVersionDate), "D")
					: "Unknown";
				const newDateStr = time(new Date(u.newVersionDate), "D");
				const sizeStr = u.newFileSize
					? `📦 Size : ${formatFileSize(u.newFileSize)}`
					: null;

				return {
					name: `${statusIcon} ${u.projectTitle}`,
					value: [
						`**\`${u.currentVersionNumber}\`** → **\`${u.newVersionNumber}\`**`,
						`📅 Installed : ${currentDateStr}`,
						`📅 Available : ${newDateStr}`,
						sizeStr,
						`🆔 \`${u.plugin.projectId}\``,
						skipped ? "*This plugin will be **skipped**.*" : null,
					]
						.filter(Boolean)
						.join("\n"),
				};
			},

			// ── Multi-select menu to toggle skip/update per plugin ─────────
			selectMenuOptions: {
				showSelectMenu: true,
				minSelect: 1,
				// Allow toggling all visible items at once
				maxSelect: (opts) => opts.length,
				placeholder: "Select plugins to toggle skip ↔ update",
			},

			selectMenuTransform: (u) => {
				const skipped = excludedIds.has(u.plugin.projectId);
				return {
					label: `${skipped ? "⏭️ Skip" : "✅ Update"}: ${u.projectTitle}`.slice(
						0,
						100,
					),
					value: u.plugin.projectId,
					description:
						`${u.currentVersionNumber} → ${u.newVersionNumber}`.slice(
							0,
							100,
						),
				};
			},

			/**
			 * Each select-menu submission TOGGLES the chosen plugins in/out of
			 * the excluded set so users can flip individual entries without
			 * losing previously made choices.
			 */
			onItemSelected: async (
				menuInteraction,
				_result,
				refreshDisplay,
			) => {
				await menuInteraction.deferUpdate();
				for (const projectId of menuInteraction.values) {
					if (excludedIds.has(projectId)) {
						excludedIds.delete(projectId);
					} else {
						excludedIds.add(projectId);
					}
				}
				// Refresh at current page — preserves scroll position.
				await refreshDisplay();
				return false; // keep the collector alive
			},

			// Apply / Cancel row appended below the pagination controls
			customComponentRows: () => buildActionRow(),

			/**
			 * Handle Apply and Cancel.
			 *
			 * IMPORTANT: these button IDs are excluded from `interactionFilter`
			 * so the paginationCollector never sees them (and won't call
			 * deferUpdate on them first).
			 */
			onComponentRowsReacted: async (componentInteraction) => {
				// Guard: only the invoking user may click these buttons
				if (componentInteraction.user.id !== interaction.user.id)
					return false;

				// ── Cancel ────────────────────────────────────────────────
				if (componentInteraction.customId === UpdateAction.Cancel) {
					await componentInteraction.update({
						content: "❌ Plugin update cancelled.",
						embeds: [],
						components: [],
					});
					return true; // stop collector
				}

				// ── Apply ─────────────────────────────────────────────────
				if (componentInteraction.customId === UpdateAction.Apply) {
					await componentInteraction.deferUpdate();

					const toUpdate = richUpdates.filter(
						(u) => !excludedIds.has(u.plugin.projectId),
					);

					if (toUpdate.length === 0) {
						await interaction.editReply({
							content:
								"No plugins are queued for update. Toggle at least one plugin back to ✅ and try again.",
							embeds: [],
							components: [],
						});
						return true;
					}

					// ── Permission gate ───────────────────────────────────
					const hasPermission = comparePermission(
						await readPermission(interaction.user, server.id),
						PermissionFlags.downloadPlugin,
					);

					if (!hasPermission) {
						// Build approval embed listing the queued updates
						const approvalEmbed = new EmbedBuilder()
							.setTitle("Update Approval Required")
							.setColor(0xf39c12)
							.setDescription(
								`<@${interaction.user.id}> is requesting to update **${toUpdate.length}** plugin${toUpdate.length !== 1 ? "s" : ""}. Please review and approve or deny below.`,
							)
							.addFields({
								name: `Queued Updates (${toUpdate.length})`,
								value: truncateList(
									toUpdate.map(
										(u) =>
											`**${u.projectTitle}** \`${u.currentVersionNumber}\` → \`${u.newVersionNumber}\``,
									),
								),
							})
							.setFooter({ text: "Expires in 15 minutes" })
							.setTimestamp();

						const approvalMsg = await interaction.editReply({
							content: "",
							embeds: [approvalEmbed],
							components: [createRequestComponent()],
						});

						const reply = await approvalMsg
							.awaitMessageComponent({
								componentType: ComponentType.Button,
								filter: async (i) =>
									comparePermission(
										await readPermission(i.user, server.id),
										PermissionFlags.downloadPlugin,
									),
								time: 15 * 60 * 1000,
							})
							.catch(() => null);

						if (!reply) {
							await interaction.editReply({
								embeds: [
									new EmbedBuilder()
										.setTitle("Request Timed Out")
										.setColor(0x95a5a6)
										.setDescription(
											"No staff member responded within 15 minutes. The update request has been cancelled.",
										)
										.setTimestamp(),
								],
								components: [],
							});
							return true;
						}

						if (reply.customId === RequestComponentId.Deny) {
							await interaction.editReply({
								embeds: [
									new EmbedBuilder()
										.setTitle("Request Denied")
										.setColor(0xe74c3c)
										.setDescription(
											"A staff member denied the plugin update request.",
										)
										.setTimestamp(),
								],
								components: [],
							});
							return true;
						}

						// Approved — fall through to the download loop below
					}

					// ── Phase 3: download with live progress embed ────────

					// Initialise all statuses to "pending"
					const statuses = new Map<string, PluginStatus>(
						toUpdate.map((u) => [u.plugin.projectId, "pending"]),
					);
					let completed = 0;

					// Show the initial progress embed (all ⬜ pending)
					await interaction.editReply({
						content: "",
						embeds: [buildProgressEmbed(toUpdate, statuses, 0)],
						components: [],
					});

					const successUpdates: SuccessEntry[] = [];
					const failedUpdates: RichUpdateEntry[] = [];

					for (const u of toUpdate) {
						// Mark as downloading and refresh the embed
						statuses.set(u.plugin.projectId, "downloading");
						await interaction.editReply({
							embeds: [
								buildProgressEmbed(
									toUpdate,
									statuses,
									completed,
								),
							],
						});

						// Perform the download
						const { filename } = await downloadPluginFile(
							server,
							u.newVersionId,
							true,
						);

						completed++;

						if (!filename) {
							statuses.set(u.plugin.projectId, "failed");
							failedUpdates.push(u);
						} else {
							statuses.set(u.plugin.projectId, "success");

							// Remove the old file when the path changed
							const newFilePath = safeJoin(
								server.config.pluginDir,
								filename,
							);
							if (
								u.plugin.filePath &&
								u.plugin.filePath !== newFilePath &&
								existsSync(u.plugin.filePath)
							) {
								await rm(u.plugin.filePath).catch(() => {});
							}

							// Remove the stale DB record
							// (downloadPluginFile already upserted the new one)
							await deletePluginRecord(
								u.plugin.projectId,
								u.plugin.versionId,
								server.id,
							);

							successUpdates.push({ entry: u, filename });
						}

						// Update the progress bar after each download
						await interaction
							.editReply({
								embeds: [
									buildProgressEmbed(
										toUpdate,
										statuses,
										completed,
									),
								],
							})
							.catch(() => {}); // swallow rare rate-limit errors
					}

					// ── Result embed ──────────────────────────────────────
					await interaction.editReply({
						embeds: [
							buildResultEmbed(
								successUpdates,
								failedUpdates,
								excludedIds,
								richUpdates,
								failedChecks,
							),
						],
					});

					return true; // stop collector
				}

				return false; // not our button — leave other collectors running
			},

			/**
			 * Exclude our custom button IDs from the paginationCollector filter
			 * so it never calls deferUpdate() on them before we do.
			 */
			interactionFilter: (i) =>
				i.user.id === interaction.user.id &&
				!Object.values(UpdateAction).includes(
					i.customId as UpdateAction,
				),

			options: {
				title: () => {
					const pending = richUpdates.length - excludedIds.size;
					return `Plugin Updates — ${pending}/${richUpdates.length} queued`;
				},
				mainColor: "Blue",
				notFoundMessage: "No updates available.",
				selectMenuPlaceholder: "Select plugins to toggle skip ↔ update",
			},
		});
	},

	permissions: orPerm(
		PermissionFlags.downloadPlugin,
		PermissionFlags.voteDownloadPlugin,
	),
	features: {
		supportedPlatforms: ["minecraft"],
	},
} satisfies CommandFile<true>;
