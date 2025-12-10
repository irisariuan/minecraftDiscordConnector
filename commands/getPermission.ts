import {
	ComponentType,
	MessageFlags,
	SlashCommandBuilder,
	userMention,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	allPermission,
	parsePermission,
	readPermission,
} from "../lib/permission";
import { settings } from "../lib/settings";
import { createServerSelectionMenu } from "../lib/embed/server";
import { getUserLocalPermission } from "../lib/db";
import { spendCredit } from "../lib/credit";

export default {
	command: new SlashCommandBuilder()
		.setName("getperm")
		.setDescription("Get the permission of a user")
		.addUserOption((option) =>
			option
				.setName("user")
				.setDescription("The user to get the permission of"),
		)
		.addBooleanOption((option) =>
			option
				.setName("local")
				.setDescription(
					"Whether to edit local permission (default: true)",
				),
		),
	requireServer: false,
	async execute({ interaction, serverManager }) {
		const user = interaction.options.getUser("user") || interaction.user;
		const local = interaction.options.getBoolean("local") ?? false;
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

		const permission =
			serverId !== undefined && local
				? await getUserLocalPermission(user.id, serverId)
				: await readPermission(user);

		if (user.id !== interaction.user.id) {
			if (
				!(await spendCredit(interaction, {
					userId: interaction.user.id,
					cost: settings.checkUserPermissionFee,
					reason: `Check Permission Of User ${user.displayName}`,
					serverId: serverId,
				}))
			) {
				return await interaction.editReply({
					content:
						"You don't have enough credit to check other users' permission",
				});
			}
		}

		if (permission) {
			await interaction.editReply({
				content: `Permission for user ${userMention(user.id)} is \`${parsePermission(permission).join(", ")}\` (\`${permission}\`${permission === allPermission ? " (**all**)" : ""})`,
			});
		} else {
			await interaction.editReply({
				content: `User ${userMention(user.id)} not found`,
			});
		}
	},
} satisfies CommandFile<false>;
