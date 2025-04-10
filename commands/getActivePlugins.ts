import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/discordCommands";
import { getActivePlugins } from "../lib/plugin";

export default {
    command: new SlashCommandBuilder()
        .setName('getactiveplugins')
        .setDescription('Get the active plugins on the server'),
    async execute(interaction) {
        interaction.deferReply({ flags: [MessageFlags.Ephemeral] })
        const activePlugins = await getActivePlugins();
        if (activePlugins === null) return interaction.editReply('Failed to fetch active plugins from server.');
        interaction.editReply(activePlugins.length > 0 ? activePlugins.join(', ') : 'No active plugins found.');
    }
} as CommandFile