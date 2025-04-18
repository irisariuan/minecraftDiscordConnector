import { GuildMember, MessageFlags, Role, roleMention, SlashCommandBuilder, User, userMention } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { allPermission, appendPermission, parsePermission, PermissionFlags, removePermission, writePermission } from "../lib/permission";

export default {
    command: new SlashCommandBuilder()
        .setName("editperm")
        .setDescription("Edit the permission of a user")
        .addSubcommand(command =>
            command
                .setName("tags")
                .setDescription("Edit the permission of users by permission tags")
                .addMentionableOption(option =>
                    option.setName("users")
                        .setDescription("The users to edit the permission of")
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
                )
        )
        .addSubcommand(command =>
            command
                .setName("value")
                .setDescription("Edit the permission of users by permission value")
                .addMentionableOption(option =>
                    option.setName("users")
                        .setDescription("The users to edit the permission of")
                        .setRequired(true)
                )
                .addNumberOption(option =>
                    option
                        .setName("permission")
                        .setDescription("The permission to edit")
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(allPermission)
                )
        ),
    async execute(interaction, client) {
        const users = interaction.options.getMentionable("users", true);
        if (interaction.options.getSubcommand(true) === 'tags') {
            const addPerm = interaction.options.getBoolean("action", true);
            const permission = interaction.options.getString("permission", true);
            if (!Object.keys(PermissionFlags).includes(permission)) {
                return interaction.reply({ content: "Invalid permission", flags: [MessageFlags.Ephemeral] });
            }
            if (users instanceof User || users instanceof GuildMember) {
                let nowPerm: number
                if (addPerm) {
                    nowPerm = await appendPermission(users.id, PermissionFlags[permission as keyof typeof PermissionFlags])
                } else {
                    nowPerm = await removePermission(users.id, PermissionFlags[permission as keyof typeof PermissionFlags])
                }
                return await interaction.reply({
                    content: `Permission ${addPerm ? "added" : "removed"} for user ${userMention(users.id)} (\`${parsePermission(nowPerm).join(", ")}\`, \`${nowPerm}\`)`,
                    flags: [MessageFlags.Ephemeral]
                });
            }
            if (users instanceof Role) {
                for (const [_, user] of users.members) {
                    if (addPerm) {
                        await appendPermission(user.user.id, PermissionFlags[permission as keyof typeof PermissionFlags])
                    } else {
                        await removePermission(user.user.id, PermissionFlags[permission as keyof typeof PermissionFlags])
                    }
                }
                return await interaction.reply({
                    content: `Permission ${addPerm ? "added" : "removed"} for role ${roleMention(users.id)}`,
                    flags: [MessageFlags.Ephemeral]
                });
            }
            return
        }
        const permission = interaction.options.getNumber("permission", true);
        if (users instanceof User || users instanceof GuildMember) {
            await writePermission(users.id, permission);
            return await interaction.reply({
                content: `Permission set to ${permission} for user ${userMention(users.id)} (\`${parsePermission(permission).join(", ")}\`, \`${permission}\`)`,
                flags: [MessageFlags.Ephemeral]
            });
        }
        if (users instanceof Role) {
            for (const [_, user] of users.members) {
                await writePermission(user.user.id, permission);
            }
            return await interaction.reply({
                content: `Permission set to ${permission} for role ${roleMention(users.id)} (\`${parsePermission(permission).join(", ")}\`, \`${permission}\`)`,
                flags: [MessageFlags.Ephemeral]
            });
        }
        return
    },
    permissions: [PermissionFlags.editPerm]
} as CommandFile