import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/discordCommands";
import { setSuspending } from "../lib/suspend";
import { PermissionFlags } from "../lib/permission";

export default {
    command: new SlashCommandBuilder()
        .setName('unsuspend')
        .setDescription('Unsuspend the server'),
    async execute(interaction) {
        setSuspending(false);
        interaction.reply({ content: "Server is resumed", flags: [MessageFlags.Ephemeral] });
    },
    permissions: [PermissionFlags.suspend]
} as CommandFile