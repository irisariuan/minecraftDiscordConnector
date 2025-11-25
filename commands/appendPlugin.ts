import {
	ComponentType,
	MessageFlags,
	SlashCommandBuilder,
	time,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { createRequestComponent, RequestComponentId } from "../lib/components";
import { sendPaginationMessage } from "../lib/pagination";
import {
	anyPerm,
	comparePermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import {
	downloadPluginFile,
	listPluginVersions,
	type PluginListVersionItem,
} from "../lib/plugin";

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
					})) || []
				).filter((v) => !onlyRelease || v.version_type === "release"),
			options: {
				title: "Select a plugin version to download",
				notFoundMessage: "No available plugin version found",
			},
			formatter: (version) => ({
				name: version.version_number,
				value: `ID: \`${version.id}\`, Published on ${time(new Date(version.date_published))}`,
			}),
			selectMenuTransform: (version) => ({
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
					const result = await request
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
					if (!result) {
						await request.edit({
							content: "Request to download plugin timed out.",
							components: [],
						});
						return false;
					}
					if (result.customId === RequestComponentId.Deny) {
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
				const { newDownload } = await downloadPluginFile(
					server.config.pluginDir,
					value,
				);
				if (!newDownload) {
					await menuInteraction.editReply({
						content:
							"Failed to download plugin or plugin already exists.",
						components: [],
						embeds: [],
					});
					return false;
				}
				await menuInteraction.editReply({
					content:
						"Plugin downloaded and appended successfully! You should restart the server to take effect",
					components: [],
					embeds: [],
				});
				collector.stop();
				const found = (await result.getData())?.find(
					(v) => v.id === value,
				);
				const filteredDependencies = found?.dependencies.filter(
					(v) => !!v.file_name,
				);
				if (
					found &&
					filteredDependencies &&
					filteredDependencies.length > 0
				) {
					await menuInteraction.followUp({
						content: `Note: This plugin has dependencies: ${filteredDependencies.map((d) => `\`${d.file_name}\` (Version \`${d.version_id}\`)`).join(", ")}. You may need to download and append them as well.`,
						flags: [MessageFlags.Ephemeral],
					});
				}
				return true;
			},
		});
	},
	permissions: anyPerm(
		PermissionFlags.downloadPlugin,
		PermissionFlags.voteDownloadPlugin,
	),
} satisfies CommandFile<true>;
