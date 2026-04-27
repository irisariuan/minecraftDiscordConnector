import {
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	SlashCommandBuilder,
	time,
} from "discord.js";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import type { CommandFile } from "../../../lib/commandFile";
import {
	createRequestComponent,
	RequestComponentId,
} from "../../../lib/component/request";
import { deletePluginRecord, getPluginsByServerId } from "../../../lib/db";
import {
	comparePermission,
	orPerm,
	PermissionFlags,
	readPermission,
} from "../../../lib/permission";
import { formatFileSize, safeJoin } from "../../../lib/utils";
import { sendSelectableActionMessage, truncateList } from "../selectable";
import {
	downloadPluginFile,
	getPlugin,
	getPluginVersionDetails,
	getProjects,
	listPluginVersions,
} from "../lib";
import { type DbPlugin, type RichUpdateEntry } from "../types";

type UpdatePluginAction = "update" | "skip";

export default {
	command: new SlashCommandBuilder()
		.setName("updateplugins")
		.setDescription(
			"Review and selectively apply updates to plugins tracked in the database",
		),
	requireServer: true,
	async execute({ interaction, server }) {
		// ── Phase 1: gather data ──────────────────────────────────────────────
		const checkStart = Date.now();
		await interaction.editReply({
			content:
				"🔍 Checking for plugin updates — please wait… (elapsed 0s)",
		});

		const plugins = await getPluginsByServerId(server.id);
		let completed = 0;
		// Keep only the most-recently updated record per projectId
		const latestByProject = new Map<string, DbPlugin>();

		const checkingTicker = setInterval(() => {
			const elapsed = Math.floor((Date.now() - checkStart) / 1000);
			interaction
				.editReply({
					content: `🔍 Checking for plugin updates — please wait… (elapsed ${elapsed}s, ${completed}/${latestByProject.size} plugins checked)`,
				})
				.catch(() => {});
		}, 1000);

		if (plugins.length === 0) {
			clearInterval(checkingTicker);
			return await interaction.editReply({
				content:
					"No plugins are tracked in the database for this server.",
			});
		}

		for (const plugin of plugins) {
			const existing = latestByProject.get(plugin.projectId);
			if (!existing || plugin.updatedAt > existing.updatedAt) {
				latestByProject.set(plugin.projectId, plugin);
			}
		}

		const checkResults = await Promise.all(
			[...latestByProject.entries()].map(async ([projectId, plugin]) => {
				try {
					const [versions, projectDetails] = await Promise.all([
						listPluginVersions(projectId, {
							loaders: [server.config.loaderType],
							game_versions: [server.config.minecraftVersion],
						}),
						getPlugin(projectId),
					]);

					const latest = versions?.[0];
					if (!versions || versions.length === 0 || !latest) {
						return { kind: "failed", projectId } as const;
					}

					// Already up-to-date — skip silently
					if (latest.id === plugin.versionId) {
						return { kind: "current" } as const;
					}

					const currentVersionDetails =
						versions.find((v) => v.id === plugin.versionId) ??
						(await getPluginVersionDetails(plugin.versionId));

					return {
						kind: "update",
						entry: {
							plugin,
							projectTitle: projectDetails?.title ?? projectId,
							currentVersionNumber:
								currentVersionDetails?.version_number ??
								plugin.versionId,
							currentVersionDate:
								currentVersionDetails?.date_published
									? new Date(
											currentVersionDetails.date_published,
										).getTime()
									: null,
							newVersionId: latest.id,
							newVersionNumber: latest.version_number,
							newVersionDate: latest.date_published,
							newFilename: latest.files[0]?.filename ?? "unknown",
							newFileSize: latest.files[0]?.size ?? null,
						} satisfies RichUpdateEntry,
					} as const;
				} finally {
					completed++;
				}
			}),
		);

		const richUpdates = checkResults.flatMap((r) =>
			r.kind === "update" ? [r.entry] : [],
		);
		const failedChecks = checkResults.flatMap((r) =>
			r.kind === "failed" ? [r.projectId] : [],
		);

		clearInterval(checkingTicker);
		const project = await getProjects(failedChecks);

		if (richUpdates.length === 0) {
			let content = "✅ All tracked plugins are already up to date!";
			if (failedChecks.length > 0) {
				content += `\n\n⚠️ Could not fetch version info for ${failedChecks.length} plugin(s): ${failedChecks.map((id) => `\`${project.get(id)?.title ?? id}\``).join(", ")}`;
			}
			return await interaction.editReply({ content });
		}

		await interaction.editReply({
			content: `Found **${richUpdates.length}** update${richUpdates.length !== 1 ? "s" : ""} — review the selection below.`,
		});

		// ── Phase 2: interactive review + download ────────────────────────────
		await sendSelectableActionMessage<RichUpdateEntry, UpdatePluginAction>({
			interaction,
			ephemeral: false,

			items: richUpdates,
			getItemId: (u) => u.plugin.projectId,

			actions: {
				update: { icon: "✅", label: "Update", isActive: true },
				skip: { icon: "⏭️", label: "Skip", isActive: false },
			},

			initialAction: () => "update",
			cycleAction: (_item, current) =>
				current === "update" ? "skip" : "update",

			// ── Selection embed ───────────────────────────────────────────
			selectionTitle: "🔄 Plugin Updates",
			selectionDescription: (counts) => {
				const lines: string[] = [
					`**${counts.update}** update${counts.update !== 1 ? "s" : ""} queued | **${counts.skip}** skipped | ${latestByProject.size} total checked`,
					"Select plugins to toggle their action, then click **Apply** when ready.",
				];
				if (failedChecks.length > 0) {
					lines.push(
						`\n⚠️ Could not check **${failedChecks.length}** plugin(s): ${failedChecks.map((id) => `\`${project.get(id)?.title ?? id}\``).join(", ")}`,
					);
				}
				return lines.join("\n");
			},
			selectionColor: 0x3498db,

			applyLabel: (counts) => {
				const n = counts.update;
				return n > 0
					? `Apply ${n} Update${n !== 1 ? "s" : ""}`
					: "Nothing to Apply";
			},

			// ── Embed field per entry ─────────────────────────────────────
			formatField: (u, action) => {
				const skipped = action === "skip";
				const currentDateStr = u.currentVersionDate
					? time(new Date(u.currentVersionDate), "D")
					: "Unknown";
				const newDateStr = time(new Date(u.newVersionDate), "D");
				const sizeStr = u.newFileSize
					? `📦 Size : ${formatFileSize(u.newFileSize)}`
					: null;

				return {
					name: `${skipped ? "⏭️" : "✅"} ${u.projectTitle}`,
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

			// ── Select-menu option per entry ──────────────────────────────
			formatOption: (u, action) => ({
				label: `${action === "skip" ? "⏭️ Skip" : "✅ Update"}: ${u.projectTitle}`,
				description: `${u.currentVersionNumber} → ${u.newVersionNumber}`,
			}),

			// ── Progress embed value per entry ────────────────────────────
			formatProgressValue: (u) => {
				const ver = `\`${u.currentVersionNumber}\` → \`${u.newVersionNumber}\``;
				const size = u.newFileSize
					? ` · ${formatFileSize(u.newFileSize)}`
					: "";
				return `${ver}${size}`;
			},

			progressTitle: "⬇️ Downloading Plugin Updates",

			// ── Result embed entry per item ───────────────────────────────
			formatResultEntry: (u, action) =>
				action === "skip"
					? `**${u.projectTitle}** *(skipped)*`
					: `**${u.projectTitle}** \`${u.currentVersionNumber}\` → \`${u.newVersionNumber}\``,

			resultFooter: (succeeded) => {
				const totalSucceeded = [...succeeded.values()].reduce(
					(sum, arr) => sum + arr.length,
					0,
				);
				return totalSucceeded > 0
					? "🔄 Restart the server for changes to take effect."
					: null;
			},

			// ── Permission gate / staff approval ──────────────────────────
			onBeforeProcess: async (toProcess, msg) => {
				const hasPermission = comparePermission(
					await readPermission(interaction.user, server.id),
					PermissionFlags.downloadPlugin,
				);

				if (hasPermission) return true;

				// Show an approval request on the same message so staff can see it
				const approvalEmbed = new EmbedBuilder()
					.setTitle("Update Approval Required")
					.setColor(0xf39c12)
					.setDescription(
						`<@${interaction.user.id}> is requesting to update **${toProcess.length}** plugin${toProcess.length !== 1 ? "s" : ""}. Please review and approve or deny below.`,
					)
					.addFields({
						name: `Queued Updates (${toProcess.length})`,
						value: truncateList(
							toProcess.map(
								({ item: u }) =>
									`**${u.projectTitle}** \`${u.currentVersionNumber}\` → \`${u.newVersionNumber}\``,
							),
						),
					})
					.setFooter({ text: "Expires in 15 minutes" })
					.setTimestamp();

				await msg.edit({
					content: "",
					embeds: [approvalEmbed],
					components: [createRequestComponent()],
				});

				const reply = await msg
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
					await msg
						.edit({
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
						})
						.catch(() => {});
					return false;
				}

				if (reply.customId === RequestComponentId.Deny) {
					await reply
						.update({
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
						})
						.catch(() => {});
					return false;
				}

				// Approved — acknowledge and let the progress embed take over
				await reply.deferUpdate().catch(() => {});
				return true;
			},

			// ── Download one plugin ───────────────────────────────────────
			process: async (u) => {
				const { filename } = await downloadPluginFile(
					server,
					u.newVersionId,
					true,
				);

				if (!filename) return false;

				// Remove the old file when the path changed
				const newFilePath = safeJoin(server.config.pluginDir, filename);
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

				return true;
			},
		});
	},

	permissions: orPerm(
		PermissionFlags.downloadPlugin,
		PermissionFlags.voteDownloadPlugin,
	),
	features: {
		supportedPlatforms: ["minecraft"],
		requireStoppedServer: true,
	},
} satisfies CommandFile<true>;
