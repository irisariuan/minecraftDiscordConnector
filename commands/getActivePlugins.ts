import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { getActivePlugins } from "../lib/plugin";

export default {
    command: new SlashCommandBuilder()
        .setName('getactiveplugins')
        .setDescription('Get the active plugins on the server')
        .addBooleanOption(option => 
            option.setName('api')
                .setDescription('Use API to query active plugins')
                .setRequired(true)
        ),
    async execute(interaction, client) {
        const useAPI = interaction.options.getBoolean('api', true);
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })
        const activePlugins = await getActivePlugins(useAPI);
        if (activePlugins === null) return await interaction.editReply('Failed to fetch active plugins from server.');
        await interaction.editReply(activePlugins.length > 0 ? activePlugins.join(', ') : 'No active plugins found.');
    }
} as CommandFile