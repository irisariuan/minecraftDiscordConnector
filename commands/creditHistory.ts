import {
	EmbedBuilder,
	italic,
	MessageFlags,
	SlashCommandBuilder,
	time,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { spendCredit, getCredit, type Transaction } from "../lib/credit";
import { settings } from "../lib/settings";
import { sendPaginationMessage } from "../lib/pagination";

export default {
	command: new SlashCommandBuilder()
		.setName("credit")
		.setDescription(
			"Get your credit balance details, or check details of another user",
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
		const user = interaction.options.getUser("user") ?? interaction.user;
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

		// Sort histories by timestamp (newest first)
		const sortedHistories = creditData.histories.sort(
			(a, b) => b.timestamp - a.timestamp,
		);

		// If no history, show just current credit
		if (sortedHistories.length === 0) {
			return await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle(`${user.username} - Credit Balance`)
						.addFields({
							name: "Current Credit",
							value: `\`${creditData.currentCredit}\``,
						})
						.addFields({
							name: "History",
							value: "No credit history found",
						}),
				],
			});
		}

		await sendPaginationMessage<Transaction>({
			interaction,
			getResult: async () => {
				const newData = await getCredit(user.id);
				return newData ? newData.histories : [];
			},
			formatter: (history) => ({
				name: history.changed >= 0 ? "Income" : "Expense",
				value: `${italic(`${history.changed > 0 ? "+" : ""}${history.changed}`)}\n\`${
					history.creditBefore
				}\`➡️\`${history.creditAfter}\`\nDate: ${time(
					new Date(history.timestamp),
				)}${history.reason ? `\nReason: \`${history.reason}\`` : ""}${
					history.ticketUsed !== null
						? `\nTicket Used: \`${history.ticketUsed.name}\` (\`${history.ticketUsed.ticketId}\`)`
						: ""
				}\nID: \`${history.trackingId}\`\n${
					history.serverTag !== null
						? `Related server: \`${history.serverTag}\``
						: "*Non-server related*"
				}`,
			}),
			options: {
				title: `${user.username} - Credit History (Current: ${creditData.currentCredit})`,
				notFoundMessage: "No credit history found",
				mainColor: "Blue",
			},
		});
	},
} satisfies CommandFile<false>;
