import { MessageFlags, SlashCommandBuilder, userMention } from "discord.js";
import type { CommandFile } from "../lib/commands";
import { appendPermission, PermissionFlags, removePermission } from "../lib/permission";

export default {
    command: new SlashCommandBuilder()
        .setName("editperm")
        .setDescription("Edit the permission of a user")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user to edit the permission of")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("permission")
                .setDescription("The permission to edit")
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName("action")
                .setDescription("Whether to add or remove the permission")
                .setRequired(true)
        ),
    async execute(interaction, client) {
        const addPerm = interaction.options.getBoolean("action", true);
        const user = interaction.options.getUser("user", true);
        const permission = interaction.options.getString("permission", true);
        if (!Object.keys(PermissionFlags).includes(permission)) {
            return interaction.reply({ content: "Invalid permission", flags: [MessageFlags.Ephemeral] });
        }
        if (addPerm) {
            await appendPermission(user.id, PermissionFlags[permission as keyof typeof PermissionFlags])
        } else {
            await removePermission(user.id, PermissionFlags[permission as keyof typeof PermissionFlags])
        }
        await interaction.reply({
            content: `Permission ${addPerm ? "added" : "removed"} for user ${userMention(user.id)}`,
            flags: [MessageFlags.Ephemeral]
        });
    }
} as CommandFile