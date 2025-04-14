import { ActivityType, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/discordCommands";
import { setSuspending } from "../lib/suspend";
import { comparePermission, PermissionFlags, readPermission } from "../lib/permission";
import { MINECRAFT_VERSION } from "../lib/plugin";
import { serverManager } from "../lib/server";

export default {
    command: new SlashCommandBuilder()
        .setName('suspend')
        .setDescription('Suspend the server'),
    async execute(interaction, client) {
        setSuspending(true);
        console.log('Server online status updated, suspending');
        if (await serverManager.isOnline.getData(true)) {
            client.user?.setActivity({ name: `Minecraft ${MINECRAFT_VERSION} Server (Suspending)`, type: ActivityType.Playing });
        } else {
            client.user?.setActivity({ name: 'Minecraft Server Offline (Suspending)', type: ActivityType.Watching })
        }
        return await interaction.reply({ content: "Server is suspending", flags: [MessageFlags.Ephemeral] });
    },
    permissions: [PermissionFlags.suspend]
} as CommandFile