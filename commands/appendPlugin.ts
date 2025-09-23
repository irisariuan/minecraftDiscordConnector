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

		const allOptions = await listPluginVersions(pluginOption, {
			loaders: [LOADER_TYPE],
			game_versions: [MINECRAFT_VERSION],
		});

		await sendPaginationMessage<PluginListVersionItem<true>>({
			interaction,
			getResult: () => allOptions || [],
			options: {
				title: "Select a plugin version to download",
				notFoundMessage: "No plugin version found",
			},
			formatter: (version) => ({
				name: version.version_number,
				value: `ID: \`${version.id}\`, Published on ${time(new Date(version.date_published))}`,
				/*
				Available for: ${version.game_versions
					.toSorted()
					.toReversed()
					.map((v) => (v === MINECRAFT_VERSION ? `**${v}**` : v))
					.join(", ")}
			 */
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
			async onItemSelected(menuInteraction) {
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
				const found = allOptions?.find((v) => v.id === value);
				if (found && found.dependencies.length > 0) {
					await menuInteraction.followUp({
						content: `Note: This plugin has dependencies: ${found.dependencies.map((d) => `\`${d.file_name}\` (Version \`${d.version_id}\`)`).join(", ")}. You may need to download and append them as well.`,
						flags: [MessageFlags.Ephemeral],
					});
				}
				return true;
			},
		});

		// const { filename, newDownload } = await downloadLatestPlugin(
		// 	pluginOption,
		// 	{ game_versions: [MINECRAFT_VERSION], loaders: [LOADER_TYPE] },
		// );
		// if (!filename) {
		// 	return interaction.editReply({ content: "Plugin not found" });
		// }
		// if (newDownload) {
		// 	return interaction.editReply({
		// 		content:
		// 			"Plugin downloaded and appended successfully! You should restart the server to take effect",
		// 	});
		// }
		// return interaction.editReply({ content: "Plugin already exists!" });
	},
	permissions: [PermissionFlags.downloadPlugin],
} as CommandFile;
