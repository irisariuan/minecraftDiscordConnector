import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/discordCommands";
import { setSuspending } from "../lib/suspend";
import { comparePermission, PermissionFlags, readPermission } from "../lib/permission";

export default {
    command: new SlashCommandBuilder()
        .setName('suspend')
        .setDescription('Suspend the server'),
    async execute(interaction) {
        setSuspending(true);
        interaction.reply({ content: "Server is suspending", flags: [MessageFlags.Ephemeral] });
    },
    permissions: [PermissionFlags.suspend]
} as CommandFile