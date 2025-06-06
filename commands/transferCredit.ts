import { MessageFlags, SlashCommandBuilder, userMention } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	changeCredit,
	getCredit,
	getJackpot,
	sendCreditNotification,
	setJackpot,
	spendCredit,
} from "../lib/credit";
import { settings } from "../lib/settings";

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
		const fromUserCredit = await getCredit(interaction.user.id);
		const toUserCredit = await getCredit(user.id);
		if (user.id === interaction.user.id) {
			return await interaction.reply({
				content: "You cannot transfer credit to yourself",
				flags: [MessageFlags.Ephemeral],
			});
		}

		let totalTransferringFee =
			settings.baseTransferringFee +
			Math.ceil(settings.trasnferringPercentageFee * amount);
		if (
			settings.transferringDifferencePenaltyTrigger < 0 ||
			Math.abs(
				fromUserCredit.currentCredit - toUserCredit.currentCredit,
			) > settings.transferringDifferencePenaltyTrigger
		) {
			totalTransferringFee += Math.ceil(
				Math.abs(
					fromUserCredit.currentCredit - toUserCredit.currentCredit,
				) * settings.transferringDifferencePenaltyPercentage,
			);
		}

		totalTransferringFee = Math.min(
			totalTransferringFee,
			settings.maxTransferringFee,
		);

		const success = await spendCredit(
			interaction.user.id,
			amount + totalTransferringFee,
			"Transfer Credit",
			false,
		);
		if (!success) {
			return await interaction.reply({
				content: `You do not have enough credit (Requires ${totalTransferringFee}, current: ${fromUserCredit.currentCredit}) to transfer ${amount} credit to ${userMention(user.id)}`,
				flags: [MessageFlags.Ephemeral],
			});
		}
		await setJackpot((await getJackpot()) + totalTransferringFee);
		await changeCredit(user.id, amount, "Received Transfer Credit");
		await sendCreditNotification(
			interaction.user,
			-amount,
			"Transfer Credit",
		);
		await sendCreditNotification(
			interaction.user,
			-totalTransferringFee,
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
