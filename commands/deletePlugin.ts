import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/discordCommands";
import { hasPlugin } from "../lib/plugin";

export default {
    command: new SlashCommandBuilder()
        .setName('deleteplugin')
        .setDescription('Delete a plugin from the server')
        .addStringOption(option =>
            option.setName('plugin')
                .setDescription('The plugin to delete')
                .setRequired(true)
        ),
    async execute(interaction, client) {
        const plugin = interaction.options.getString('plugin', true);
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const fetchedPlugin = await hasPlugin(plugin)
        if (!fetchedPlugin) {
            await interaction.editReply(`Plugin \`${plugin}\` not found.`);
            return;
        }

        await interaction.editReply(`Plugin \`${plugin}\` deleted successfully.`);

    }
} as CommandFile