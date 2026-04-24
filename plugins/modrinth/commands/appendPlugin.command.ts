import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import {
	ComponentType,
	MessageFlags,
	SlashCommandBuilder,
	time,
} from "discord.js";
import type { CommandFile } from "../../../lib/commandFile";
import {
	createRequestComponent,
	RequestComponentId,
} from "../../../lib/component/request";
import { deletePluginRecord, getPluginsByServerId } from "../../../lib/db";
import { sendPaginationMessage } from "../../../lib/pagination";
import {
	orPerm,
	comparePermission,
	PermissionFlags,
	readPermission,
} from "../../../lib/permission";
import { downloadPluginFile, listPluginVersions } from "../lib";
import type { PluginListVersionItem } from "../types";

export default {
	command: new SlashCommandBuilder()
		.setName("appendplugin")
		.setDescription("Append a plugin to the server")
		.addStringOption((option) =>
			option
				.setName("plugin")
				.setDescription("The plugin to append")
				.setRequired(true),
		)
		.addBooleanOption((option) =>
			option
				.setName("release")
				.setDescription("Whether to only show stable releases"),
		),
	requireServer: true,
	async execute({ interaction, server }) {
		const userPermission = await readPermission(
			interaction.user,
			server.id,
		);

		const pluginOption = interaction.options.getString("plugin", true);
		const onlyRelease = interaction.options.getBoolean("release") ?? false;

		const collector = await sendPaginationMessage<
			PluginListVersionItem<true>
		>({
			interactionFilter: (reaction) =>
				reaction.user.id === interaction.user.id,
			interaction,
			getResult: async () =>
				(
					(await listPluginVersions(pluginOption, {
						loaders: [server.config.loaderType],
						game_versions: [server.config.minecraftVersion],
					})) ?? []
				).filter((v) => !onlyRelease || v.version_type === "release"),
			options: {
				title: "Select a plugin version to download",
				notFoundMessage: "No available plugin version found",
			},
			formatter: (version) => ({
				name: version.version_number,
				value: `ID: \`${version.id}\`, Published on ${time(new Date(version.date_published))}`,
			}),
			selectMenuOptions: { showSelectMenu: true },
			selectMenuTransform: (version, index) => ({
				label: version.version_number,
				value: version.id,
			}),
			filterFunc(filter) {
				return (version) => {
					if (!filter) return true;
					return (
						version.version_number
							.toLowerCase()
							.includes(filter.toLowerCase()) ||
						version.id === filter
					);
				};
			},
			async onItemSelected(menuInteraction, result) {
				await menuInteraction.deferUpdate();
				const value = menuInteraction.values[0];
				if (!value) return false;

				// ── Permission check ──────────────────────────────────────
				if (
					!comparePermission(
						userPermission,
						PermissionFlags.downloadPlugin,
					)
				) {
					const request = await menuInteraction.followUp({
						content: `Please ask a staff to permit your request on downloading \`${value}\``,
						components: [createRequestComponent()],
					});
					const staffResult = await request
						.awaitMessageComponent({
							componentType: ComponentType.Button,
							filter: async (i) =>
								comparePermission(
									await readPermission(i.user, server.id),
									PermissionFlags.downloadPlugin,
								),
							time: 1000 * 60 * 10,
						})
						.catch(() => null);
					if (!staffResult) {
						await request.edit({
							content: "Request to download plugin timed out.",
							components: [],
						});
						return false;
					}
					if (staffResult.customId === RequestComponentId.Deny) {
						await request.edit({
							content: "Request to download plugin denied.",
							components: [],
						});
						return false;
					}
					await request.edit({
						content: `Your request to download \`${value}\` has been approved. Downloading...`,
						components: [],
					});
				}

				// ── Cache version list ────────────────────────────────────
				const allVersions = await result.getData();
				const selectedVersion = allVersions?.find(
					(v) => v.id === value,
				);

				// ── Upgrade check (same project, different installed version) ──
				let upgradeHandled = false;

				if (selectedVersion?.project_id) {
					const serverPlugins = await getPluginsByServerId(server.id);
					const existingRecord = serverPlugins.find(
						(p) =>
							p.projectId === selectedVersion.project_id &&
							p.versionId !== value,
					);

					if (existingRecord) {
						const existingVersionLabel =
							allVersions?.find(
								(v) => v.id === existingRecord.versionId,
							)?.version_number ?? existingRecord.versionId;
						const newVersionLabel = selectedVersion.version_number;

						// First confirmation
						const firstMsg = await menuInteraction.followUp({
							content: `Version \`${existingVersionLabel}\` of this plugin is already installed. Replacing it with \`${newVersionLabel}\` will remove the old version. Are you sure?`,
							components: [
								createRequestComponent({
									showDeny: false,
									showCancel: true,
								}),
							],
							flags: MessageFlags.Ephemeral,
						});
						const firstConfirm = await firstMsg
							.awaitMessageComponent({
								componentType: ComponentType.Button,
								filter: (i) =>
									i.user.id === interaction.user.id,
								time: 1000 * 60 * 2,
							})
							.catch(() => null);

						await firstMsg.edit({ components: [] });

						if (
							!firstConfirm ||
							firstConfirm.customId === RequestComponentId.Cancel
						) {
							await firstConfirm?.deferUpdate().catch(() => {});
							await menuInteraction.editReply({
								content: "Plugin replacement cancelled.",
								components: [],
								embeds: [],
							});
							return false;
						}

						await firstConfirm.deferUpdate();

						// Second confirmation
						const secondMsg = await menuInteraction.followUp({
							content: `Are you absolutely sure you want to replace \`${existingVersionLabel}\` with \`${newVersionLabel}\`? This cannot be undone.`,
							components: [
								createRequestComponent({
									showDeny: false,
									showCancel: true,
								}),
							],
							flags: MessageFlags.Ephemeral,
						});
						const secondConfirm = await secondMsg
							.awaitMessageComponent({
								componentType: ComponentType.Button,
								filter: (i) =>
									i.user.id === interaction.user.id,
								time: 1000 * 60 * 2,
							})
							.catch(() => null);

						await secondMsg.edit({ components: [] });

						if (
							!secondConfirm ||
							secondConfirm.customId === RequestComponentId.Cancel
						) {
							await secondConfirm?.deferUpdate().catch(() => {});
							await menuInteraction.editReply({
								content: "Plugin replacement cancelled.",
								components: [],
								embeds: [],
							});
							return false;
						}

						await secondConfirm.deferUpdate();

						// Download new version (force in case filename collides)
						const { newDownload: upgraded } =
							await downloadPluginFile(server, value, true);

						if (!upgraded) {
							await menuInteraction.editReply({
								content:
									"Failed to download the new plugin version.",
								components: [],
								embeds: [],
							});
							return false;
						}

						// Remove old file and DB record
						if (
							existingRecord.filePath &&
							existsSync(existingRecord.filePath)
						) {
							await rm(existingRecord.filePath).catch(() => {});
						}
						await deletePluginRecord(
							existingRecord.projectId,
							existingRecord.versionId,
							server.id,
						);

						await menuInteraction.editReply({
							content: `Plugin upgraded from \`${existingVersionLabel}\` to \`${newVersionLabel}\` successfully! You should restart the server to take effect.`,
							components: [],
							embeds: [],
						});

						upgradeHandled = true;
					}
				}

				// ── Normal download flow ──────────────────────────────────
				if (!upgradeHandled) {
					const { newDownload, filename } = await downloadPluginFile(
						server,
						value,
					);

					if (!newDownload && filename === null) {
						await menuInteraction.editReply({
							content: "Failed to download plugin.",
							components: [],
							embeds: [],
						});
						return false;
					}

					if (!newDownload && filename !== null) {
						// Same version already on disk — offer single replace
						const confirmMsg = await menuInteraction.followUp({
							content: `Plugin \`${filename}\` already exists on the server. Do you want to replace it?`,
							components: [
								createRequestComponent({
									showDeny: false,
									showCancel: true,
								}),
							],
							flags: MessageFlags.Ephemeral,
						});
						const confirmation = await confirmMsg
							.awaitMessageComponent({
								componentType: ComponentType.Button,
								filter: (i) =>
									i.user.id === interaction.user.id,
								time: 1000 * 60 * 2,
							})
							.catch(() => null);

						await confirmMsg.edit({ components: [] });

						if (
							!confirmation ||
							confirmation.customId === RequestComponentId.Cancel
						) {
							await confirmation?.deferUpdate().catch(() => {});
							await menuInteraction.editReply({
								content: "Plugin replacement cancelled.",
								components: [],
								embeds: [],
							});
							return false;
						}

						await confirmation.deferUpdate();
						const { newDownload: replaced } =
							await downloadPluginFile(server, value, true);

						if (!replaced) {
							await menuInteraction.editReply({
								content: "Failed to replace the plugin.",
								components: [],
								embeds: [],
							});
							return false;
						}

						await menuInteraction.editReply({
							content:
								"Plugin replaced successfully! You should restart the server to take effect.",
							components: [],
							embeds: [],
						});
					} else {
						await menuInteraction.editReply({
							content:
								"Plugin downloaded and appended successfully! You should restart the server to take effect.",
							components: [],
							embeds: [],
						});
					}
				}

				// ── Common end: stop collector + dependency notice ────────
				collector.stop();
				const filteredDependencies =
					selectedVersion?.dependencies.filter((v) => !!v.file_name);
				if (
					selectedVersion &&
					filteredDependencies &&
					filteredDependencies.length > 0
				) {
					await menuInteraction.followUp({
						content: `Note: This plugin has dependencies: ${filteredDependencies.map((d) => `\`${d.file_name}\` (Version \`${d.version_id}\`)`).join(", ")}. You may need to download and append them as well.`,
						flags: MessageFlags.Ephemeral,
					});
				}
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
	},
} satisfies CommandFile<true>;
