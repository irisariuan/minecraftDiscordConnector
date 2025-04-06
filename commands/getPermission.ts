import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commands";
import { parsePermission, readPermission } from "../lib/permission";

export default {
    command: new SlashCommandBuilder()
        .setName("getperm")
        .setDescription("Get the permission of a user")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user to get the permission of")
                .setRequired(true)
        ),
    async execute(interaction, client) {
        const user = interaction.options.getUser("user", true);
        const permission = await readPermission(user.id);
        if (permission) {
            await interaction.reply({
                content: `Permission for user ${user.username} is ${parsePermission(permission).join(", ")}`,
                flags: [MessageFlags.Ephemeral],
            });
        } else {
            await interaction.reply({
                content: `User ${user.username} not found`,
                flags: [MessageFlags.Ephemeral],
            });
        }
    }
} as CommandFile