import { ActivityType, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/discordCommands";
import { setSuspending } from "../lib/suspend";
import { PermissionFlags } from "../lib/permission";
import { MINECRAFT_VERSION } from "../lib/plugin";
import { serverManager } from "../lib/server";

export default {
    command: new SlashCommandBuilder()
        .setName('unsuspend')
        .setDescription('Unsuspend the server'),
    async execute(interaction, client) {
        setSuspending(false);
        if (await serverManager.isOnline.getData(true)) {
            client.user?.setActivity({ name: `Minecraft ${MINECRAFT_VERSION} Server`, type: ActivityType.Playing })
        } else {
            client.user?.setActivity({ name: 'Minecraft Server Offline', type: ActivityType.Watching })
        }
        return await interaction.reply({ content: "Server is resumed", flags: [MessageFlags.Ephemeral] });
    },
    permissions: [PermissionFlags.suspend]
} as CommandFile