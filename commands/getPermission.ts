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
import {
	createServerSelectionMenu,
	getUserSelectedServer,
} from "../lib/component/server";
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
		const user = interaction.options.getUser("user") ?? interaction.user;
		const local = interaction.options.getBoolean("local") ?? false;
		const serverId = local
			? (await getUserSelectedServer(serverManager, interaction, true))
					?.id
			: undefined;
		const permission =
			serverId !== undefined && local
				? await getUserLocalPermission(user.id, serverId)
				: await readPermission(user);

		if (
			user.id !== interaction.user.id &&
			!(await spendCredit(interaction, {
				userId: interaction.user.id,
				cost: settings.checkUserPermissionFee,
				reason: `Check Permission Of User ${user.displayName}`,
				serverId: serverId,
			}))
		) {
			return await interaction.editReply({
				content: "Failed to check other users' permission",
			});
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
	features: {
		unsuspendable: true,
	},
} satisfies CommandFile<false>;
