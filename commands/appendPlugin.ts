import { MessageFlags, SlashCommandBuilder, time } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	downloadPluginFile,
	listPluginVersions,
	LOADER_TYPE,
	MINECRAFT_VERSION,
	type PluginListVersionItem,
} from "../lib/plugin";
import {
	comparePermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import { sendPaginationMessage } from "../lib/pagination";

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
	async execute(interaction, client) {
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		if (
			!comparePermission(
				await readPermission(interaction.user.id),
				PermissionFlags.downloadPlugin,
			)
		) {
			return interaction.editReply({
				content: "You do not have permission to download plugins.",
			});
		}

		const pluginOption = interaction.options.getString("plugin", true);
		const onlyRelease = interaction.options.getBoolean("release") ?? false;

		await sendPaginationMessage<PluginListVersionItem<true>>({
			interaction,
			getResult: async () =>
				(
					(await listPluginVersions(pluginOption, {
						loaders: [LOADER_TYPE],
						game_versions: [MINECRAFT_VERSION],
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
				const value = menuInteraction.values[0];
				if (!value) return false;
				const { newDownload } = await downloadPluginFile(value);
				if (!newDownload) {
					await menuInteraction.reply({
						content:
							"Failed to download plugin or plugin already exists.",
					});
					return false;
				}
				await menuInteraction.reply({
					content:
						"Plugin downloaded and appended successfully! You should restart the server to take effect",
				});
				const found = (await result.getData())?.find(
					(v) => v.id === value,
				);
				if (found && found.dependencies.length > 0) {
					await menuInteraction.followUp({
						content: `Note: This plugin has dependencies: ${found.dependencies.map((d) => `\`${d.file_name}\` (Version \`${d.version_id}\`)`).join(", ")}. You may need to download and append them as well.`,
						flags: [MessageFlags.Ephemeral],
					});
				}
				return true;
			},
		});
	},
	permissions: [PermissionFlags.downloadPlugin],
} as CommandFile;
