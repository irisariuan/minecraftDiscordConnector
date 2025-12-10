import {
	EmbedBuilder,
	italic,
	MessageFlags,
	SlashCommandBuilder,
	time,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { spendCredit, getCredit } from "../lib/credit";
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
	requireServer: false,
	async execute({ interaction }) {
		await interaction.deferReply({
			flags: [MessageFlags.Ephemeral],
		});
		const user = interaction.options.getUser("user") || interaction.user;
		if (
			user.id !== interaction.user.id &&
			!(await spendCredit(interaction, {
				userId: interaction.user.id,
				cost: settings.checkUserCreditFee,
				reason: `Check credit of user ${user.displayName}`,
			}))
		) {
			return await interaction.editReply({
				content:
					"You don't have enough credit to check other users' credit",
			});
		}

		const creditData = await getCredit(user.id);
		if (!creditData) {
			return await interaction.editReply({
				content: "User has no credit data",
			});
		}

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
								value: `${italic(`${history.changed > 0 ? "+" : ""}${history.changed}`)}\n\`${
									history.creditBefore
								}\`➡️\`${
									history.creditAfter
								}\`\nTimestamp: ${time(
									new Date(history.timestamp),
								)}${
									history.reason
										? `\nReason: \`${history.reason}\``
										: ""
								}\nTracking ID: \`${history.trackingId}\`\n${history.serverTag ? `Server: \`${history.serverTag}\`` : "*Non-server related*"}`,
							})),
					)
					.setFooter({
						text: `Showing latest ${Math.min(20, creditData.histories.length)} histories`,
					}),
			],
		});
	},
} satisfies CommandFile<false>;
