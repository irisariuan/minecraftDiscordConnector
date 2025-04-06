import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commands";
import { fetchOnlinePlayers } from "../lib/request";

export default {
    command: new SlashCommandBuilder()
        .setName("onlineplayers")
        .setDescription("Get a list of online players"),
    async execute(interaction, client) {
        
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })

        const onlinePlayers = await fetchOnlinePlayers()
        if (!onlinePlayers || onlinePlayers.length === 0) {
            return interaction.editReply("No players are currently online.")
        }
        const playerList = onlinePlayers.join(", ")
        await interaction.editReply(`Online players: ${playerList}`)
    },
} as CommandFile