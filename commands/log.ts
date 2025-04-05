import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commands";
import { sendPaginationMessage } from "../lib/pagination";
import { getLogs } from "../lib/request";

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
        
        sendPaginationMessage(() => {
            return getLogs()
        }, interaction, filter || undefined)
    }
} as CommandFile