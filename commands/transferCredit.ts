import {
	ActionRowBuilder,
	ButtonBuilder,
	ComponentType,
	MessageFlags,
	SlashCommandBuilder,
	time,
	userMention,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	changeCredit,
	createApproveButton,
	createCancelButton,
	CreditNotificationButtonId,
	getCredit,
	sendCreditNotification,
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
	async execute({ interaction }) {
		const user = interaction.options.getUser("user", true);
		const amount = interaction.options.getNumber("amount", true);
		const fromUserCredit = await getCredit(interaction.user.id);
		const toUserCredit = await getCredit(user.id);
		if (!fromUserCredit) {
			return await interaction.reply({
				content: "You do not have an account",
				flags: [MessageFlags.Ephemeral],
			});
		}
		if (!toUserCredit) {
			return await interaction.reply({
				content:
					"The user you are transferring to does not have an account",
				flags: [MessageFlags.Ephemeral],
			});
		}
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
			settings.transferringDifferencePenaltyThreshold < 0 ||
			Math.abs(
				fromUserCredit.currentCredit - toUserCredit.currentCredit,
			) > settings.transferringDifferencePenaltyThreshold
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

		const message = await interaction.reply({
			content: `Transferring ${amount} credit to ${userMention(user.id)} will cost a total fee of ${totalTransferringFee} credit. You will be charged a total of ${amount + totalTransferringFee} credit. Do you want to proceed? (React before ${time(
				new Date(Date.now() + 1000 * 60 * 5),
			)})`,
			flags: [MessageFlags.Ephemeral],
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					createApproveButton(),
					createCancelButton(),
				),
			],
		});
		const reply = await message
			.awaitMessageComponent({
				componentType: ComponentType.Button,
				filter: (i) => i.user.id === interaction.user.id,
				time: 1000 * 60 * 5,
			})
			.catch(() => null);
		if (!reply) {
			return await interaction.editReply({
				content: "Transfer credit request timed out.",
				components: [],
			});
		}
		await reply.update({});
		if (reply.customId === CreditNotificationButtonId.CancelButton) {
			return await interaction.editReply({
				content: "Transfer credit request cancelled.",
				components: [],
			});
		}

		const success = await spendCredit(
			interaction.user.id,
			amount + totalTransferringFee,
			"Transfer Credit",
		);
		if (!success) {
			return await interaction.editReply({
				content: `You do not have enough credit (Requires ${totalTransferringFee}, current: ${fromUserCredit.currentCredit}) to transfer ${amount} credit to ${userMention(user.id)}`,
				components: [],
			});
		}
		await changeCredit(user.id, amount, "Received Transfer Credit");
		await sendCreditNotification({
			user: interaction.user,
			creditChanged: -amount,
			reason: "Transfer Credit",
		});
		await sendCreditNotification({
			user: interaction.user,
			creditChanged: -totalTransferringFee,
			reason: "Transfer Credit Fee",
		});
		await sendCreditNotification({
			user,
			creditChanged: amount,
			reason: "Received Transfer Credit",
			silent: true,
			cancellable: true,
			maxRefund: amount,
			onRefund: async (refundAmount) => {
				await changeCredit(
					interaction.user.id,
					-refundAmount,
					"Transfer Credit Refund",
				);
				await sendCreditNotification({
					user: interaction.user,
					creditChanged: refundAmount,
					reason: "Transfer Credit Refund",
				});
			},
		});
		return await interaction.editReply({
			content: `Successfully transferred ${amount} credit to ${user.username}`,
			components: [],
		});
	},
} as CommandFile;
