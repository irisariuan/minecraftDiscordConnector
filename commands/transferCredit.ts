import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	changeCredit,
	sendCreditNotification,
	spendCredit,
} from "../lib/credit";

export const transferringFee = 5;

export default {
	command: new SlashCommandBuilder()
		.setName("transfercredit")
		.setDescription("Transfer credit to another user")
		.addUserOption((option) =>
			option
				.setName("user")
				.setDescription("The user to transfer credit to")
				.setRequired(true),
		)
		.addNumberOption((option) =>
			option
				.setName("amount")
				.setDescription("The amount of credit to transfer")
				.setRequired(true)
				.setMinValue(1),
		),
	async execute(interaction, client) {
		const user = interaction.options.getUser("user", true);
		const amount = interaction.options.getNumber("amount", true);
		if (user.id === interaction.user.id) {
			return await interaction.reply({
				content: "You cannot transfer credit to yourself",
				flags: [MessageFlags.Ephemeral],
			});
		}
		await spendCredit(
			interaction.user.id,
			amount + transferringFee,
			"Transfer Credit",
		);
		await changeCredit(user.id, amount, "Received Transfer Credit");
		await sendCreditNotification(
			interaction.user,
			-amount,
			"Transfer Credit",
		);
		await sendCreditNotification(
			interaction.user,
			-transferringFee,
			"Transfer Credit Fee",
		);
		await sendCreditNotification(
			user,
			amount,
			"Received Transfer Credit",
			true,
		);
		return await interaction.reply({
			content: `Successfully transferred ${amount} credit to ${user.username}`,
			flags: [MessageFlags.Ephemeral],
		});
	},
} as CommandFile;
