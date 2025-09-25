import {
	EmbedBuilder,
	italic,
	MessageFlags,
	SlashCommandBuilder,
	time
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { getCredit, sendCreditNotification, spendCredit } from "../lib/credit";
import { settings } from "../lib/settings";

export default {
	command: new SlashCommandBuilder()
		.setName("credit")
		.setDescription(
			"Get your credit balance details, or check deetails of another user",
		)
		.addUserOption((option) =>
			option
				.setName("user")
				.setDescription("The user to check the credit of")
				.setRequired(false),
		),
	async execute(interaction, client) {
		await interaction.deferReply({
			flags: [MessageFlags.Ephemeral],
		});
		const user = interaction.options.getUser("user") || interaction.user;
		if (user.id !== interaction.user.id) {
			if (
				!(await spendCredit(
					interaction.user.id,
					settings.checkUserCreditFee,
					"Check Credit of Other Users",
				))
			) {
				return await interaction.editReply({
					content:
						"You don't have enough credit to check other users' credit",
				});
			}
			await sendCreditNotification({ user: interaction.user, creditChanged: -settings.checkUserCreditFee, reason: "Check Credit of Other Users" })
		}

		const creditData = await getCredit(user.id);

		await interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setTitle(user.username)
					.addFields({
						name: "Current Credit",
						value: `\`${creditData.currentCredit}\``,
					})
					.addFields(
						creditData.histories
							.sort((a, b) => b.timestamp - a.timestamp)
							.slice(0, 21)
							.map((history) => ({
								name:
									history.changed >= 0 ? "Income" : "Expense",
								value: `${italic(`${history.changed > 0 ? "+" : ""}${history.changed}`)}\n\`${history.creditBefore}\`➡️\`${history.creditAfter}\`\nTimestamp: ${time(new Date(history.timestamp))}${history.reason ? `\nReason: \`${history.reason}\`` : ""}\nTracking ID: \`${history.trackingId}\``,
							})),
					)
					.setFooter({
						text: `Showing latest ${Math.min(20, creditData.histories.length)} histories`,
					}),
			],
		});
	},
} as CommandFile;
