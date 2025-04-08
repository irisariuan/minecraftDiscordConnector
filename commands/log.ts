import { MessageFlags, SlashCommandBuilder, time } from "discord.js";
import type { CommandFile } from "../lib/discordCommands";
import { sendPaginationMessage } from "../lib/pagination";
import { serverManager } from "../lib/server";

export default {
    command: new SlashCommandBuilder()
        .setName("log")
        .setDescription("Get the server log")
        .addStringOption(option =>
            option.setName("filter")
                .setDescription("Filter the log by keyword")
                .setRequired(false)
        ),
    async execute(interaction, client) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })

        const filter = interaction.options.getString("filter");

        sendPaginationMessage({
            interaction,
            options: {
                filter: filter || undefined
            },
            async getResult() {
                return serverManager.outputLines
            },
            filterFunc: (filter) => ((log) => {
                if (!filter) return true;
                return log.type.includes(filter) || log.message.includes(filter);
            }),
            formatter: (log) => {
                return {
                    name: log.type.toUpperCase(),
                    value: `${time(new Date(log.timestamp))}\n${log.message}`,
                }
            }
        })
    }
} as CommandFile