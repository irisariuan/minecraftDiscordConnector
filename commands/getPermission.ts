import { MessageFlags, SlashCommandBuilder, userMention } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	allPermission,
	parsePermission,
    readPermission,
} from "../lib/permission";
import { sendCreditNotification, spendCredit } from "../lib/credit";
import { settings } from "../lib/settings";

export default {
	command: new SlashCommandBuilder()
		.setName("getperm")
		.setDescription("Get the permission of a user")
		.addUserOption((option) =>
			option
				.setName("user")
				.setDescription("The user to get the permission of"),
		),
	async execute(interaction, client) {
		const user = interaction.options.getUser("user") || interaction.user;
		const permission = await readPermission(user);

		if (user.id !== interaction.user.id) {
			if (
				!(await spendCredit(
					interaction.user.id,
					settings.checkUserPermissionFee,
					"Check Permission Of Other Users",
				))
			) {
				return await interaction.reply({
					content:
						"You don't have enough credit to check other users' permission",
					flags: [MessageFlags.Ephemeral],
				});
			}
			await sendCreditNotification({ user: interaction.user, creditChanged: -settings.checkUserPermissionFee, reason: "Check Permission Of Other Users" });
		}

		if (permission) {
			await interaction.reply({
				content: `Permission for user ${userMention(user.id)} is \`${parsePermission(permission).join(", ")}\` (\`${permission}\`${permission === allPermission ? " (**all**)" : ""})`,
				flags: [MessageFlags.Ephemeral],
			});
		} else {
			await interaction.reply({
				content: `User ${userMention(user.id)} not found`,
				flags: [MessageFlags.Ephemeral],
			});
		}
	},
} as CommandFile;
