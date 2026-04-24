import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
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
import { safeJoin } from "../../../lib/utils";
import {
	downloadPluginFile,
	getPlugin,
	getPluginVersionDetails,
	listPluginVersions,
} from "../lib";
import { type DbPlugin, type RichUpdateEntry } from "../types";

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
			content: "Checking for plugin updates — please wait…",
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

			// Already up-to-date — nothing to do
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
				newVersionDate: latest.date_published, // already a number (transformed)
				newFilename: latest.files[0]?.filename ?? "unknown",
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

				return {
					name: `${statusIcon} ${u.projectTitle}`,
					value: [
						`**\`${u.currentVersionNumber}\`** → **\`${u.newVersionNumber}\`**`,
						`📅 Installed : ${currentDateStr}`,
						`📅 Available : ${newDateStr}`,
						`🆔 \`${u.plugin.projectId}\``,
						skipped ? "*This plugin will be **skipped**.*" : "",
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
								"No plugins are queued for update. Select at least one plugin and try again.",
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

					const updateSummary = toUpdate
						.map(
							(u) =>
								`- **${u.projectTitle}**: \`${u.currentVersionNumber}\` → \`${u.newVersionNumber}\``,
						)
						.join("\n");

					if (!hasPermission) {
						const approvalMsg = await interaction.editReply({
							content: `Please ask a staff member to approve updating ${toUpdate.length} plugin(s):\n${updateSummary}`,
							embeds: [],
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
								content: "⏳ Update request timed out.",
								components: [],
							});
							return true;
						}

						if (reply.customId === RequestComponentId.Deny) {
							await interaction.editReply({
								content:
									"🚫 Update request was denied by staff.",
								components: [],
							});
							return true;
						}

						await interaction.editReply({
							content: `✅ Approved by staff. Applying ${toUpdate.length} update(s)…`,
							components: [],
						});
					} else {
						await interaction.editReply({
							content: `⬇️ Applying ${toUpdate.length} update(s)…\n${updateSummary}`,
							embeds: [],
							components: [],
						});
					}

					// ── Apply updates ─────────────────────────────────────
					const successUpdates: string[] = [];
					const failedUpdates: string[] = [];

					for (const u of toUpdate) {
						const { filename } = await downloadPluginFile(
							server,
							u.newVersionId,
							true,
						);

						if (!filename) {
							failedUpdates.push(u.projectTitle);
							continue;
						}

						// Remove old file only when the path changed
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

						successUpdates.push(
							`**${u.projectTitle}** \`${u.currentVersionNumber}\` → \`${u.newVersionNumber}\` (\`${filename}\`)`,
						);
					}

					// ── Result report ─────────────────────────────────────
					const resultParts: string[] = [];

					if (successUpdates.length > 0) {
						resultParts.push(
							`✅ **Updated (${successUpdates.length}):**\n${successUpdates.map((s) => `- ${s}`).join("\n")}`,
						);
					}
					if (failedUpdates.length > 0) {
						resultParts.push(
							`❌ **Failed to update (${failedUpdates.length}):**\n${failedUpdates.map((s) => `- \`${s}\``).join("\n")}`,
						);
					}
					if (excludedIds.size > 0) {
						resultParts.push(
							`⏭️ **Skipped (${excludedIds.size}):**\n${[...excludedIds].map((id) => `- \`${id}\``).join("\n")}`,
						);
					}
					if (failedChecks.length > 0) {
						resultParts.push(
							`⚠️ **Could not check (${failedChecks.length}):**\n${failedChecks.map((id) => `- \`${id}\``).join("\n")}`,
						);
					}

					const footer =
						successUpdates.length > 0
							? "\n\n🔄 Restart the server for changes to take effect."
							: "";

					await interaction.editReply({
						content: resultParts.join("\n\n") + footer,
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
