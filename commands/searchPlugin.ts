import { SlashCommandBuilder, MessageFlags, time } from "discord.js";
import {
	listPluginVersions,
	LOADER_TYPE,
	MINECRAFT_VERSION,
	searchPlugins,
	type PluginListVersionItem,
	type PluginSearchQueryItem,
} from "../lib/plugin";
import type { CommandFile } from "../lib/commandFile";
import { sendPaginationMessage } from "../lib/pagination";
import { trimTextWithSuffix } from "../lib/utils";

export default {
	command: new SlashCommandBuilder()
		.setName("searchplugin")
		.setDescription("Search for a plugin")
		.addStringOption((option) =>
			option.setName("plugin").setDescription("The plugin to search for"),
		),
	async execute(interaction, client) {
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		const pluginOption = interaction.options.getString("plugin");

		sendPaginationMessage<PluginSearchQueryItem<false>>({
			interaction,
			async getResult(page) {
				const results = [];
				for (let i = 0; i < Math.ceil((page + 1) / 5); i++) {
					const plugins = await searchPlugins({ offset: i * 20 });
					if ("error" in plugins) {
						continue;
					}
					results.push(...plugins.hits);
				}
				return results;
			},
			formatter: (plugin) => {
				const usable =
					plugin.versions.includes(MINECRAFT_VERSION) &&
					plugin.categories.includes(LOADER_TYPE);
				return {
					name: plugin.title,
					value: `${plugin.description}\nID: ${plugin.slug}, ${usable ? "Usable on this server" : "Not usable on this server"}, Latest Version: ${plugin.latest_version}`,
				};
			},
			filterFunc: (filter) => {
				return (plugin) => {
					if (!filter) return true;
					return (
						plugin.title
							.toLowerCase()
							.includes(filter.toLowerCase()) ||
						plugin.description
							.toLowerCase()
							.includes(filter.toLowerCase()) ||
						plugin.slug.toLowerCase().includes(filter.toLowerCase())
					);
				};
			},
			options: {
				filter: pluginOption || undefined,
				title: "Search Plugin",
				notFoundMessage: "No plugin found",
				unfixablePageNumber: true,
			},
			selectMenuTransform: (plugin) => ({
				label: plugin.title,
				description: trimTextWithSuffix(plugin.description, 100),
				value: plugin.slug,
			}),
			onItemSelected: async (menuInteraction) => {
				const value = menuInteraction.values[0];
				if (!value) return false;
				const details = await listPluginVersions(value, {
					loaders: [LOADER_TYPE],
				});
				await menuInteraction.deferReply();
				await sendPaginationMessage<PluginListVersionItem<true>>({
					interaction: menuInteraction,
					getResult: () => details || [],
					formatter: (version) => ({
						name: version.version_number,
						value: `ID: \`${version.id}\`, Published on ${time(new Date(version.date_published))}, ${version.game_versions.includes(MINECRAFT_VERSION) ? "Usable on this server" : "Not usable on this server"}`,
					}),
					options: {
						title: `Versions of ${value}`,
						notFoundMessage: "No version found",
					},
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
				});
				return false;
			},
		});
	},
} as CommandFile;
