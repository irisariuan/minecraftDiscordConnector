import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { LOADER_TYPE, MINECRAFT_VERSION, searchPlugins, type PluginSearchQueryItem } from "../lib/plugin";
import type { CommandFile } from "../lib/discordCommands";
import { sendPaginationMessage } from "../lib/pagination";

export default {
    command: new SlashCommandBuilder()
        .setName("searchplugin")
        .setDescription("Search for a plugin")
        .addStringOption(option =>
            option.setName("plugin")
                .setDescription("The plugin to search for")
        ),
    async execute(interaction, client) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const pluginOption = interaction.options.getString("plugin");

        sendPaginationMessage<PluginSearchQueryItem<false>>({
            interaction,
            async getResult(page) {
                const results = []
                for (let i = 0; i <= Math.ceil(page / 5); i++) {
                    const plugins = await searchPlugins({ offset: i * 20 })
                    if ('error' in plugins) {
                        continue
                    }
                    results.push(...plugins.hits)
                }
                return results
            },
            formatter: (plugin) => {
                const usable = plugin.versions.includes(MINECRAFT_VERSION) && plugin.categories.includes(LOADER_TYPE);
                return {
                    name: plugin.title,
                    value: `${plugin.description}\nID: ${plugin.slug}, ${usable ? "Usable on this server" : "Not usable on this server"}`,
                }
            },
            filterFunc: (filter) => {
                return (plugin) => {
                    if (!filter) return true;
                    return plugin.title.toLowerCase().includes(filter.toLowerCase()) || plugin.description.toLowerCase().includes(filter.toLowerCase()) || plugin.slug.toLowerCase().includes(filter.toLowerCase());
                }
            },
            options: {
                filter: pluginOption || undefined,
                title: "Search Plugin",
                notFoundMessage: "No plugin found",
                unfixablePageNumber: true
            }
        })
    }
} as CommandFile