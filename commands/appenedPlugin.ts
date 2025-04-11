import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/discordCommands";
import { downloadLatestPlugin, getPlugin, LOADER_TYPE, MINECRAFT_VERSION } from "../lib/plugin";
import { comparePermission, PermissionFlags, readPermission } from "../lib/permission";

export default {
    command: new SlashCommandBuilder()
        .setName("appendplugin")
        .setDescription("Append a plugin to the server")
        .addStringOption(option =>
            option.setName("plugin")
                .setDescription("The plugin to append")
                .setRequired(true)
        ),
    async execute(interaction, client) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        if (!comparePermission(await readPermission(interaction.user.id), PermissionFlags.downloadPlugin)) {
            return interaction.editReply({ content: "You do not have permission to download plugins." });
        }

        const pluginOption = interaction.options.getString("plugin", true);

        const { filename, newDownload } = await downloadLatestPlugin(pluginOption, { game_versions: [MINECRAFT_VERSION], loaders: [LOADER_TYPE] })

        if (!filename) {
            return interaction.editReply({ content: "Plugin not found" });
        }
        if (newDownload) {
            return interaction.editReply({ content: "Plugin downloaded and appended successfully! You should restart the server to take effect" });
        }
        return interaction.editReply({ content: "Plugin already exists!" });
    },
    permissions: [PermissionFlags.downloadPlugin]
} as CommandFile