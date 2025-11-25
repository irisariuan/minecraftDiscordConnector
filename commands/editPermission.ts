import {
	ComponentType,
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
import { createServerSelectionMenu } from "../lib/embed/server";

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
				)
				.addBooleanOption((option) =>
					option
						.setName("local")
						.setDescription(
							"Whether to edit local permission (default: false)",
						),
				)
				.addBooleanOption((option) =>
					option
						.setName("force")
						.setDescription(
							"Force using this permission when the user uses this server (Local permission only)",
						),
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
				)
				.addBooleanOption((option) =>
					option
						.setName("local")
						.setDescription(
							"Whether to edit local permission (default: true)",
						),
				)
				.addBooleanOption((option) =>
					option
						.setName("force")
						.setDescription(
							"Force using this permission when the user uses this server (Local permission only)",
						),
				),
		),
	requireServer: false,
	async execute({ interaction, serverManager }) {
		const subcommand = interaction.options.getSubcommand(true);
		const users = interaction.options.getMentionable("users", true);
		const local = interaction.options.getBoolean("local") ?? false;
		const force = interaction.options.getBoolean("force") ?? false;
		let serverId: number | undefined = undefined;
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		if (local) {
			const reply = await interaction.editReply({
				content: "Please select a server:",
				components: [
					createServerSelectionMenu(serverManager.getAllTagPairs()),
				],
			});
			try {
				const selection = await reply.awaitMessageComponent({
					time: 60000,
					filter: (i) => i.user.id === interaction.user.id,
					componentType: ComponentType.StringSelect,
				});
				const selectedServerId = selection.values[0];
				if (!selectedServerId) {
					return selection.update({
						content: "No server selected",
						components: [],
					});
				}
				const selectedServer = serverManager.getServer(
					parseInt(selectedServerId),
				);
				if (!selectedServer) {
					return selection.update({
						content: "Selected server not found",
						components: [],
					});
				}
				serverId = selectedServer.id;
				await selection.update({
					content: "Server selected",
					components: [],
				});
			} catch (e) {
				console.error(e);
				return await interaction.editReply({
					content: "No server selected in time or an error occurred",
					components: [],
				});
			}
		}

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
				return interaction.editReply({
					content: "Invalid permission",
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
					nowPerm = await appendPermission(
						users.id,
						perm,
						serverId,
						force,
					);
				} else {
					nowPerm = await removePermission(
						users.id,
						perm,
						serverId,
						force,
					);
				}
				return await interaction.editReply({
					content: `Permission ${addPerm ? "added" : "removed"} for user ${userMention(users.id)} (\`${parsePermission(nowPerm).join(", ")}\`, \`${nowPerm}\`)`,
				});
			}
			if (users instanceof Role) {
				for (const [_, user] of users.members) {
					if (addPerm) {
						await appendPermission(
							user.user.id,
							perm,
							serverId,
							force,
						);
					} else {
						await removePermission(
							user.user.id,
							perm,
							serverId,
							force,
						);
					}
				}
				return await interaction.editReply({
					content: `Permission ${addPerm ? "added" : "removed"} for role ${roleMention(users.id)}`,
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
				await updateUserPermission(
					users.id,
					permission,
					serverId,
					force,
				);
				return await interaction.editReply({
					content: `Permission set to ${permission} for user ${userMention(users.id)} (\`${parsePermission(permission).join(", ")}\`, \`${permission}\`)`,
				});
			}
			if (users instanceof Role) {
				for (const [_, user] of users.members) {
					await updateUserPermission(
						user.user.id,
						permission,
						serverId,
						force,
					);
				}
				return await interaction.editReply({
					content: `Permission set to ${permission} for role ${roleMention(users.id)} (\`${parsePermission(permission).join(", ")}\`, \`${permission}\`)`,
				});
			}
			return;
		}
		return interaction.editReply({
			content: "Unknown subcommand",
		});
	},
	permissions: PermissionFlags.editPerm,
} satisfies CommandFile<false>;
