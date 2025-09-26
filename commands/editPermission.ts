import {
	GuildMember,
	MessageFlags,
	Role,
	roleMention,
	SlashCommandBuilder,
	User,
	userMention,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	allPermission,
	appendPermission,
	parsePermission,
	PermissionFlags,
	removePermission,
} from "../lib/permission";
import { updateUserPermission } from "../lib/db";

export default {
	command: new SlashCommandBuilder()
		.setName("editperm")
		.setDescription("Edit the permission of a user")
		.addSubcommand((command) =>
			command
				.setName("tags")
				.setDescription(
					"Edit the permission of users by permission tags",
				)
				.addMentionableOption((option) =>
					option
						.setName("users")
						.setDescription("The users to edit the permission of")
						.setRequired(true),
				)
				.addStringOption((option) =>
					option
						.setName("permission")
						.setDescription("The permission to edit")
						.setRequired(true),
				)
				.addBooleanOption((option) =>
					option
						.setName("action")
						.setDescription(
							"Whether to add or remove the permission",
						)
						.setRequired(true),
				),
		)
		.addSubcommand((command) =>
			command
				.setName("value")
				.setDescription(
					"Edit the permission of users by permission value",
				)
				.addMentionableOption((option) =>
					option
						.setName("users")
						.setDescription("The users to edit the permission of")
						.setRequired(true),
				)
				.addNumberOption((option) =>
					option
						.setName("permission")
						.setDescription("The permission to edit")
						.setRequired(true)
						.setMinValue(0)
						.setMaxValue(allPermission),
				),
		),
	async execute(interaction, client) {
		const subcommand = interaction.options.getSubcommand(true);
		const users = interaction.options.getMentionable("users", true);
		if (subcommand === "tags") {
			const addPerm = interaction.options.getBoolean("action", true);
			const permission = interaction.options.getString(
				"permission",
				true,
			);
			if (
				!Object.keys(PermissionFlags).includes(permission) &&
				permission !== "all"
			) {
				return interaction.reply({
					content: "Invalid permission",
					flags: [MessageFlags.Ephemeral],
				});
			}
			const perm =
				permission === "all"
					? allPermission
					: PermissionFlags[
							permission as keyof typeof PermissionFlags
						];
			if (users instanceof User || users instanceof GuildMember) {
				let nowPerm: number;
				if (addPerm) {
					nowPerm = await appendPermission(users.id, perm);
				} else {
					nowPerm = await removePermission(users.id, perm);
				}
				return await interaction.reply({
					content: `Permission ${addPerm ? "added" : "removed"} for user ${userMention(users.id)} (\`${parsePermission(nowPerm).join(", ")}\`, \`${nowPerm}\`)`,
					flags: [MessageFlags.Ephemeral],
				});
			}
			if (users instanceof Role) {
				for (const [_, user] of users.members) {
					if (addPerm) {
						await appendPermission(user.user.id, perm);
					} else {
						await removePermission(user.user.id, perm);
					}
				}
				return await interaction.reply({
					content: `Permission ${addPerm ? "added" : "removed"} for role ${roleMention(users.id)}`,
					flags: [MessageFlags.Ephemeral],
				});
			}
			return;
		}
		if (subcommand === "value") {
			const permission = interaction.options.getNumber(
				"permission",
				true,
			);
			if (users instanceof User || users instanceof GuildMember) {
				await updateUserPermission(users.id, permission);
				return await interaction.reply({
					content: `Permission set to ${permission} for user ${userMention(users.id)} (\`${parsePermission(permission).join(", ")}\`, \`${permission}\`)`,
					flags: [MessageFlags.Ephemeral],
				});
			}
			if (users instanceof Role) {
				for (const [_, user] of users.members) {
					await updateUserPermission(user.user.id, permission);
				}
				return await interaction.reply({
					content: `Permission set to ${permission} for role ${roleMention(users.id)} (\`${parsePermission(permission).join(", ")}\`, \`${permission}\`)`,
					flags: [MessageFlags.Ephemeral],
				});
			}
			return;
		}
		return interaction.reply({
			content: "Unknown subcommand",
			flags: [MessageFlags.Ephemeral],
		})
	},
	permissions: PermissionFlags.editPerm,
} as CommandFile;
