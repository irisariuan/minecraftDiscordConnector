import {
	bold,
	inlineCode,
	MessageFlags,
	SlashCommandBuilder,
	userMention,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { getUserSelectedServer } from "../lib/component/server";
import {
	addServerAccess,
	clearServerAccess,
	getServerAccessByUserId,
	removeServerAccess,
} from "../lib/db";
import { PermissionFlags } from "../lib/permission";

export default {
	command: new SlashCommandBuilder()
		.setName("restrictaccess")
		.setDescription("Manage which servers a user is allowed to access")
		.addSubcommand((sub) =>
			sub
				.setName("add")
				.setDescription(
					"Add a server to a user's allowlist (restricts them to only allowed servers)",
				)
				.addUserOption((opt) =>
					opt
						.setName("user")
						.setDescription("The user to restrict")
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("remove")
				.setDescription("Remove a server from a user's allowlist")
				.addUserOption((opt) =>
					opt
						.setName("user")
						.setDescription("The user")
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("list")
				.setDescription(
					"List all server access restrictions for a user",
				)
				.addUserOption((opt) =>
					opt
						.setName("user")
						.setDescription("The user")
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("clear")
				.setDescription(
					"Remove all access restrictions for a user (restores full access)",
				)
				.addUserOption((opt) =>
					opt
						.setName("user")
						.setDescription("The user")
						.setRequired(true),
				),
		),
	requireServer: false,
	async execute({ interaction, serverManager }) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const subcommand = interaction.options.getSubcommand(true);
		const targetUser = interaction.options.getUser("user", true);

		switch (subcommand) {
			case "add": {
				// Admin picks which server to add to the user's allowlist.
				// No userId filter — admin must be able to see all servers.
				const server = await getUserSelectedServer(
					serverManager,
					interaction,
					true,
				);
				if (!server) return;

				await addServerAccess(targetUser.id, server.id);

				return await interaction.editReply({
					content: `✅ ${userMention(targetUser.id)} can now access ${bold(server.config.tag ?? `Server #${server.id}`)}. They can only use servers on their allowlist.`,
				});
			}

			case "remove": {
				const access = await getServerAccessByUserId(targetUser.id);
				if (access.length === 0) {
					return await interaction.editReply({
						content: `${userMention(targetUser.id)} has no access restrictions — they can already use all servers.`,
					});
				}

				// Let admin pick from the user's current allowlist only.
				const server = await getUserSelectedServer(
					serverManager,
					interaction,
					true,
				);
				if (!server) return;

				const entry = access.find((a) => a.serverId === server.id);
				if (!entry) {
					return await interaction.editReply({
						content: `${bold(server.config.tag ?? `Server #${server.id}`)} is not in ${userMention(targetUser.id)}'s allowlist.`,
					});
				}

				await removeServerAccess(targetUser.id, server.id);

				const remaining = access.length - 1;
				return await interaction.editReply({
					content:
						remaining === 0
							? `✅ Removed ${bold(server.config.tag ?? `Server #${server.id}`)} from ${userMention(targetUser.id)}'s allowlist. They now have unrestricted access to all servers.`
							: `✅ Removed ${bold(server.config.tag ?? `Server #${server.id}`)} from ${userMention(targetUser.id)}'s allowlist. ${remaining} server(s) remaining.`,
				});
			}

			case "list": {
				const access = await getServerAccessByUserId(targetUser.id);

				if (access.length === 0) {
					return await interaction.editReply({
						content: `${userMention(targetUser.id)} has no access restrictions — they can use all servers.`,
					});
				}

				const lines = access
					.map(
						(a: {
							serverId: number;
							server: { tag: string | null };
						}) =>
							`• ${bold(a.server.tag ?? `Server #${a.serverId}`)} ${inlineCode(`#${a.serverId}`)}`,
					)
					.join("\n");

				return await interaction.editReply({
					content: `🔒 ${userMention(targetUser.id)} is restricted to:\n${lines}`,
				});
			}

			case "clear": {
				const access = await getServerAccessByUserId(targetUser.id);

				if (access.length === 0) {
					return await interaction.editReply({
						content: `${userMention(targetUser.id)} has no restrictions to clear.`,
					});
				}

				await clearServerAccess(targetUser.id);

				return await interaction.editReply({
					content: `✅ Cleared all ${access.length} server access restriction(s) for ${userMention(targetUser.id)}. They can now access all servers.`,
				});
			}

			default:
				return await interaction.editReply({
					content: "Unknown subcommand.",
				});
		}
	},
	permissions: PermissionFlags.restrictServerAccess,
} satisfies CommandFile<false>;
