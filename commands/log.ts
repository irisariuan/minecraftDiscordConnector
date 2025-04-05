import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commands";
import { sendPaginationMessage } from "../lib/pagination";
import { getLogs } from "../lib/request";

export default {
    command: new SlashCommandBuilder()
        .setName("log")
        .setDescription("Get the server log"),
    async execute(interaction, client) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })
        sendPaginationMessage(() => {
            return getLogs()
        }, interaction)
        await interaction.editReply({ })
    }
} as CommandFile