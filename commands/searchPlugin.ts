import { SlashCommandBuilder, time } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { sendPaginationMessage } from "../lib/pagination";
import { listPluginVersions, searchPlugins } from "../lib/server/plugin";
import {
	type PluginListVersionItem,
	type PluginSearchQueryItem,
} from "../lib/server/plugin/types";
import { trimTextWithSuffix } from "../lib/utils";

export default {
	command: new SlashCommandBuilder()
		.setName("searchplugin")
		.setDescription("Search for a plugin")
		.addStringOption((option) =>
			option.setName("plugin").setDescription("The plugin to search for"),
		)
		.addBooleanOption((option) =>
			option
				.setName("release")
				.setDescription("Whether to only show stable releases"),
		),
	requireServer: true,
	async execute({ interaction, server }) {
		const pluginOption = interaction.options.getString("plugin");
		const onlyRelease = interaction.options.getBoolean("release") ?? false;

		sendPaginationMessage<PluginSearchQueryItem<false>>({
			interaction,
			async getResult({ pageNumber, filter }) {
				const results = [];
				for (let i = 0; i < Math.ceil((pageNumber + 1) / 5); i++) {
					const plugins = await searchPlugins({
						offset: i * 20,
						query: filter,
						facets: {
							categories: [server.config.loaderType],
							versions: [server.config.minecraftVersion],
						},
					});
					if ("error" in plugins) {
						continue;
					}
					results.push(...plugins.hits);
				}
				return results;
			},
			formatter: (plugin) => {
				const usable =
					plugin.versions.includes(server.config.minecraftVersion) &&
					plugin.categories.includes(server.config.loaderType);
				return {
					name: plugin.title,
					value: `${plugin.description}\nSlug: \`${plugin.slug}\`, Project ID: \`${plugin.project_id}\`, ${usable ? "✅Usable on this server" : "❌Not usable on this server"}, Latest Version ID: \`${plugin.latest_version}\``,
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
				filter: pluginOption ?? undefined,
				title: "Search Plugin",
				notFoundMessage: "No plugin found",
				unfixablePageNumber: true,
			},
			selectMenuTransform: (plugin, index) => ({
				label: trimTextWithSuffix(plugin.title, 100),
				description: trimTextWithSuffix(plugin.description, 100),
				value: plugin.slug,
			}),
			onItemSelected: async (menuInteraction) => {
				const value = menuInteraction.values[0];
				if (!value) return false;

				await menuInteraction.deferReply();
				await sendPaginationMessage<PluginListVersionItem<true>>({
					interaction: menuInteraction,
					getResult: async () =>
						(await listPluginVersions(value)) ?? [],
					formatter: (version) => ({
						name: version.version_number,
						value: `ID: \`${version.id}\`, Published on ${time(
							new Date(version.date_published),
						)},
						${
							version.game_versions.includes(
								server.config.minecraftVersion,
							) &&
							version.loaders.includes(server.config.loaderType)
								? "✅Usable on this server"
								: "❌Not usable on this server"
						}, Release Type: \`${version.version_type}\``,
					}),
					options: {
						title: `Versions of ${value}`,
						notFoundMessage: "No version found",
					},
					filterFunc(filter) {
						return (version) => {
							if (!filter) return true;
							return (
								(version.version_number
									.toLowerCase()
									.includes(filter.toLowerCase()) ||
									version.id === filter) &&
								(!onlyRelease ||
									version.version_type === "release")
							);
						};
					},
				});
				return false;
			},
		});
	},
	ephemeral: true,
	features: {
		supportedPlatforms: ["minecraft"],
	},
} satisfies CommandFile<true>;
