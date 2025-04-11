import { MessageFlags, SlashCommandBuilder, userMention } from "discord.js";
import type { CommandFile } from "../lib/discordCommands";
import { parsePermission, readPermission } from "../lib/permission";

export default {
    command: new SlashCommandBuilder()
        .setName("getperm")
        .setDescription("Get the permission of a user")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user to get the permission of")
        ),
    async execute(interaction, client) {
        const user = interaction.options.getUser("user") || interaction.user
        const permission = await readPermission(user.id);
        if (permission) {
            await interaction.reply({
                content: `Permission for user ${userMention(user.id)} is \`${parsePermission(permission).join(", ")}\` (\`${permission}\`)`,
                flags: [MessageFlags.Ephemeral],
            });
        } else {
            await interaction.reply({
                content: `User ${userMention(user.id)} not found`,
                flags: [MessageFlags.Ephemeral],
            });
        }
    }
} as CommandFile