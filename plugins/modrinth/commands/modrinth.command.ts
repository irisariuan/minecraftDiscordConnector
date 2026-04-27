import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import {
	ChatInputCommandInteraction,
	ComponentType,
	MessageComponentInteraction,
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
import { trimTextWithSuffix } from "../../../lib/utils";
import {
	downloadModpackFile,
	downloadPluginFile,
	listPluginVersions,
	resolveProjectDependencies,
	searchPlugins,
} from "../lib";
import { sendSelectableActionMessage } from "../selectable";
import {
	ProjectType,
	type PluginListVersionItem,
	type PluginSearchQueryItem,
} from "../types";
import type { Server } from "../../../lib/server";
import { offerDependencyInstall } from "./deps";

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTENT_TYPES = ["plugin", "modpack"] as const;
type ContentType = (typeof CONTENT_TYPES)[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usableOnServer(
	plugin: PluginSearchQueryItem,
	minecraftVersion: string,
	loaderType: string,
): boolean {
	return (
		plugin.versions.includes(minecraftVersion) &&
		plugin.categories.includes(loaderType)
	);
}

// ─── Command ──────────────────────────────────────────────────────────────────

export default {
	command: new SlashCommandBuilder()
		.setName("modrinth")
		.setDescription("Search and download plugins or modpacks from Modrinth")
		.addStringOption((option) =>
			option
				.setName("type")
				.setDescription(
					"Type of content to search for (default: plugin)",
				)
				.addChoices(
					{ name: "Plugin / Mod", value: "plugin" },
					{ name: "Modpack", value: "modpack" },
				),
		)
		.addStringOption((option) =>
			option
				.setName("query")
				.setDescription("Search query (leave blank to browse all)"),
		)
		.addBooleanOption((option) =>
			option
				.setName("release")
				.setDescription(
					"Only show stable releases when viewing versions",
				),
		)
		.addBooleanOption((option) =>
			option.setName("skipcheck").setDescription("Skip pre-checks"),
		),
	requireServer: true,
	ephemeral: true,

	async execute({ interaction, server }) {
		const contentType = (interaction.options.getString("type") ??
			"plugin") as ContentType;
		const query = interaction.options.getString("query") ?? undefined;
		const onlyRelease = interaction.options.getBoolean("release") ?? false;
		const forceDownload =
			interaction.options.getBoolean("skipcheck") ?? false;

		const isModpack = contentType === "modpack";
		const userPermission = await readPermission(
			interaction.user,
			server.id,
		);
		// ── Outer: Search results ─────────────────────────────────────────
		let searchCollector: Awaited<ReturnType<typeof sendPaginationMessage>>;

		searchCollector = await sendPaginationMessage<
			PluginSearchQueryItem<false>
		>({
			interaction,
			async getResult({ pageNumber, filter }) {
				const results: PluginSearchQueryItem<false>[] = [];
				// Each page of pagination covers 20 results; Modrinth gives 100 per call.
				// Fetch incrementally so we don't over-request on the first page.
				for (let i = 0; i < Math.ceil((pageNumber + 1) / 5); i++) {
					const resp = await searchPlugins({
						offset: i * 100,
						query: filter ?? query,
						facets: isModpack
							? {
									...(forceDownload
										? {}
										: {
												versions: [
													server.config
														.minecraftVersion,
												],
											}),
									project_type: [ProjectType.Modpack],
								}
							: {
									...(forceDownload
										? {}
										: {
												categories: [
													server.config.loaderType,
												],
												versions: [
													server.config
														.minecraftVersion,
												],
											}),
									project_type: [ProjectType.Mod, "plugin"],
								},
						skipServerSideFilter: isModpack || forceDownload,
					});
					if ("error" in resp) continue;
					results.push(...resp.hits);
				}
				return results;
			},

			formatter: (plugin) => {
				const usable = isModpack
					? plugin.versions.includes(server.config.minecraftVersion)
					: usableOnServer(
							plugin,
							server.config.minecraftVersion,
							server.config.loaderType,
						);
				return {
					name: plugin.title,
					value: [
						plugin.description,
						`Slug: \`${plugin.slug}\``,
						`ID: \`${plugin.project_id}\``,
						usable
							? "✅ Compatible with this server"
							: "❌ Not compatible with this server",
						`Latest: \`${plugin.latest_version}\``,
					].join(" · "),
				};
			},

			filterFunc: (filter) => (plugin) => {
				if (!filter) return true;
				const f = filter.toLowerCase();
				return (
					plugin.title.toLowerCase().includes(f) ||
					plugin.description.toLowerCase().includes(f) ||
					plugin.slug.toLowerCase().includes(f)
				);
			},

			options: {
				filter: query,
				title: isModpack ? "Search Modpacks" : "Search Plugins / Mods",
				notFoundMessage: isModpack
					? "No modpacks found."
					: "No plugins / mods found.",
				unfixablePageNumber: true,
			},

			selectMenuOptions: { showSelectMenu: true },
			selectMenuTransform: (plugin) => ({
				label: trimTextWithSuffix(plugin.title, 100),
				description: trimTextWithSuffix(plugin.description, 100),
				value: plugin.slug,
			}),

			interactionFilter: (i) => i.user.id === interaction.user.id,

			// ── Inner: Version list for the selected project ──────────────
			onItemSelected: async (menuInteraction, _searchResult) => {
				const slug = menuInteraction.values[0];
				if (!slug) return false;

				await menuInteraction.deferReply({
					flags: MessageFlags.Ephemeral,
				});

				await selectVersionToDownload({
					interaction: menuInteraction,
					slug,
					server,
					userPermission,
					onlyRelease,
					isModpack,
					onFinish: () => {
						searchCollector.stop();
					},
					skipCheck: forceDownload,
				});

				// The version browser is open; stop the search select menu
				// so the user focuses on the version list.
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

async function selectVersionToDownload({
	interaction,
	slug,
	server,
	userPermission,
	onlyRelease,
	isModpack,
	onFinish,
	skipCheck,
}: {
	interaction: ChatInputCommandInteraction | MessageComponentInteraction;
	slug: string;
	server: Server;
	userPermission: number;
	onlyRelease: boolean;
	isModpack: boolean;
	skipCheck?: boolean;
	onFinish?: () => void;
}) {
	const collector = await sendPaginationMessage<PluginListVersionItem<true>>({
		interaction,

		getResult: async () => {
			const versions = await listPluginVersions(
				slug,
				skipCheck
					? {}
					: {
							loaders: [server.config.loaderType],
							game_versions: [server.config.minecraftVersion],
						},
			);
			return (versions ?? []).filter(
				(v) => !onlyRelease || v.version_type === "release",
			);
		},

		formatter: (version) => {
			const compatible =
				version.game_versions.includes(
					server.config.minecraftVersion,
				) && version.loaders.includes(server.config.loaderType);
			return {
				name: version.version_number,
				value: [
					`ID: \`${version.id}\``,
					`Published: ${time(new Date(version.date_published))}`,
					compatible ? "✅ Compatible" : "❌ Not compatible",
					`Type: \`${version.version_type}\``,
				].join(" · "),
			};
		},

		filterFunc: (filter) => (version) => {
			if (!filter) return true;
			return (
				version.version_number
					.toLowerCase()
					.includes(filter.toLowerCase()) || version.id === filter
			);
		},

		options: {
			title: `Versions of \`${slug}\``,
			notFoundMessage: "No versions found for this server.",
		},

		selectMenuOptions: { showSelectMenu: true },
		selectMenuTransform: (version) => ({
			label: version.version_number,
			description: version.version_type,
			value: version.id,
		}),

		interactionFilter: (i) => i.user.id === interaction.user.id,

		// ── Download the selected version ─────────────────────
		onItemSelected: async (versionInteraction, versionResult) => {
			await versionInteraction.deferUpdate();
			const versionId = versionInteraction.values[0];
			if (!versionId) return false;

			// ── Permission check ──────────────────────────────
			if (
				!comparePermission(
					userPermission,
					PermissionFlags.downloadPlugin,
				)
			) {
				const request = await versionInteraction.followUp({
					content: `Please ask a staff member to approve downloading version \`${versionId}\`.`,
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
						content: "Download request timed out.",
						components: [],
					});
					return false;
				}
				if (staffResult.customId === RequestComponentId.Deny) {
					await request.edit({
						content: "Download request denied.",
						components: [],
					});
					return false;
				}
				await request.edit({
					content: `Request approved. Downloading \`${versionId}\`…`,
					components: [],
				});
			}

			// ── Modpack download flow ─────────────────────────
			if (isModpack) {
				await versionInteraction.editReply({
					content: `Downloading and installing modpack version \`${versionId}\`… This may take a while.`,
					components: [],
					embeds: [],
				});

				const result = await downloadModpackFile(server, versionId);

				if (!result.success) {
					await versionInteraction.editReply({
						content: `Failed to install modpack: ${result.error ?? "Unknown error."}`,
						components: [],
						embeds: [],
					});
					return false;
				}

				await versionInteraction.editReply({
					content: [
						`✅ Modpack **${result.name ?? versionId}** installed successfully!`,
						`Downloaded **${result.filesDownloaded}** file${result.filesDownloaded !== 1 ? "s" : ""}.`,
						result.filesSkipped > 0
							? `⚠️ Skipped **${result.filesSkipped}** file${result.filesSkipped !== 1 ? "s" : ""} incompatible with server.`
							: null,
						"🔄 Restart the server for changes to take effect.",
					]
						.filter(Boolean)
						.join("\n"),
					components: [],
					embeds: [],
				});

				onFinish?.();
				collector.stop();
				const deps = await resolveProjectDependencies(
					result.projectIds,
					new Set(result.projectIds),
					server.config.minecraftVersion,
					[server.config.loaderType],
				);
				await offerDependencyInstall(versionInteraction, server, deps);
				return true;
			}

			// ── Plugin download flow ──────────────────────────
			const allVersions = await versionResult.getData();
			const selectedVersion = allVersions?.find(
				(v) => v.id === versionId,
			);

			// Check for an existing installed version of the same project
			let upgradeHandled = false;
			if (selectedVersion?.project_id) {
				const serverPlugins = await getPluginsByServerId(server.id);
				const existingRecord = serverPlugins.find(
					(p) =>
						p.projectId === selectedVersion.project_id &&
						p.versionId !== versionId,
				);

				if (existingRecord) {
					const existingLabel =
						allVersions?.find(
							(v) => v.id === existingRecord.versionId,
						)?.version_number ?? existingRecord.versionId;
					const newLabel = selectedVersion.version_number;
					if (await server.isOnline.getData()) {
						await versionInteraction.editReply({
							content: `A different version (\`${existingLabel}\`) of this plugin is already installed, please close the server and run this command again to upgrade to \`${newLabel}\`.`,
							components: [],
							embeds: [],
						});
						return false;
					}

					const replaceMsg = await versionInteraction.followUp({
						content: `Version \`${existingLabel}\` of this plugin is already installed. Replace it with \`${newLabel}\`?`,
						components: [
							createRequestComponent({
								showDeny: false,
								showCancel: true,
							}),
						],
						flags: MessageFlags.Ephemeral,
					});

					const confirm = await replaceMsg
						.awaitMessageComponent({
							componentType: ComponentType.Button,
							filter: (i) => i.user.id === interaction.user.id,
							time: 1000 * 60 * 2,
						})
						.catch(() => null);

					if (!confirm) {
						await replaceMsg
							.edit({ components: [] })
							.catch(() => {});
						await versionInteraction.editReply({
							content: "Plugin replacement cancelled.",
							components: [],
							embeds: [],
						});
						return false;
					}

					await confirm.update({ components: [] });

					if (confirm.customId === RequestComponentId.Cancel) {
						await versionInteraction.editReply({
							content: "Plugin replacement cancelled.",
							components: [],
							embeds: [],
						});
						return false;
					}

					const { newDownload: upgraded } = await downloadPluginFile(
						server,
						versionId,
						true,
					);

					if (!upgraded) {
						await versionInteraction.editReply({
							content:
								"Failed to download the new plugin version.",
							components: [],
							embeds: [],
						});
						return false;
					}

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

					await versionInteraction.editReply({
						content: `Plugin upgraded from \`${existingLabel}\` → \`${newLabel}\` successfully! Restart the server to apply.`,
						components: [],
						embeds: [],
					});
					upgradeHandled = true;
				}
			}

			if (!upgradeHandled) {
				const { newDownload, filename } = await downloadPluginFile(
					server,
					versionId,
				);

				if (!newDownload && filename === null) {
					await versionInteraction.editReply({
						content: "Failed to download plugin.",
						components: [],
						embeds: [],
					});
					return false;
				}

				if (!newDownload && filename !== null) {
					// Same file already on disk — offer to replace
					const confirmMsg = await versionInteraction.followUp({
						content: `Plugin \`${filename}\` already exists on the server. Replace it?`,
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
							filter: (i) => i.user.id === interaction.user.id,
							time: 1000 * 60 * 2,
						})
						.catch(() => null);

					if (!confirmation) {
						await confirmMsg
							.edit({ components: [] })
							.catch(() => {});
						await versionInteraction.editReply({
							content: "Plugin replacement cancelled.",
							components: [],
							embeds: [],
						});
						return false;
					}

					await confirmation.update({
						components: [],
					});

					if (confirmation.customId === RequestComponentId.Cancel) {
						await versionInteraction.editReply({
							content: "Plugin replacement cancelled.",
							components: [],
							embeds: [],
						});
						return false;
					}

					const { newDownload: replaced } = await downloadPluginFile(
						server,
						versionId,
						true,
					);
					if (!replaced) {
						await versionInteraction.editReply({
							content: "Failed to replace the plugin.",
							components: [],
							embeds: [],
						});
						return false;
					}

					await versionInteraction.editReply({
						content:
							"Plugin replaced successfully! Restart the server to apply.",
						components: [],
						embeds: [],
					});
				} else {
					await versionInteraction.editReply({
						content:
							"Plugin downloaded successfully! Restart the server to apply.",
						components: [],
						embeds: [],
					});
				}
			}

			if (selectedVersion) {
				const installedPlugins = await getPluginsByServerId(server.id);
				const installedProjectIds = new Set(
					installedPlugins.map((p) => p.projectId),
				);
				const deps = await resolveProjectDependencies(
					[selectedVersion.project_id],
					installedProjectIds,
					server.config.minecraftVersion,
					[server.config.loaderType],
				);
				await offerDependencyInstall(versionInteraction, server, deps);
			}

			return true;
		},
	});
	return collector;
}
