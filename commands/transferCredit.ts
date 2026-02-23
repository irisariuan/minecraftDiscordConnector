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
	spendCredit,
	changeCredit,
	createApproveTransactionButton,
	createCancelTransactionButton,
	CreditNotificationButtonId,
	getCredit,
	sendCreditNotification,
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
	requireServer: false,
	async execute({ interaction }) {
		const user = interaction.options.getUser("user", true);
		const amount = interaction.options.getNumber("amount", true);
		const fromUserCredit = await getCredit(interaction.user.id);
		const toUserCredit = await getCredit(user.id);
		if (!fromUserCredit) {
			return await interaction.reply({
				content: "You do not have an account",
				flags: MessageFlags.Ephemeral,
			});
		}
		if (!toUserCredit) {
			return await interaction.reply({
				content:
					"The user you are transferring to does not have an account",
				flags: MessageFlags.Ephemeral,
			});
		}
		if (user.id === interaction.user.id) {
			return await interaction.reply({
				content: "You cannot transfer credit to yourself",
				flags: MessageFlags.Ephemeral,
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
			flags: MessageFlags.Ephemeral,
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					createApproveTransactionButton(),
					createCancelTransactionButton(),
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

		const payment = await spendCredit({
			user: interaction.user,
			channel: interaction.channel,
			cost: amount + totalTransferringFee,
			reason: `Transfer Credit (${amount} credits with ${totalTransferringFee} fee to ${userMention(user.id)})`,
		});
		if (!payment) {
			return await interaction.editReply({
				content: `Failed to transfer credit. Requires ${totalTransferringFee}, current: ${fromUserCredit.currentCredit}) to transfer ${amount} credit to ${userMention(user.id)}`,
				components: [],
			});
		}
		await changeCredit({
			userId: user.id,
			change: amount,
			reason: "Received Transfer Credit",
		});
		await sendCreditNotification({
			user,
			creditChanged: amount,
			reason: "Received Transfer Credit",
			silent: true,
			cancellable: true,
			maxRefund: amount,
			onRefund: async (refundAmount) => {
				if (refundAmount <= 0 || payment.changed <= 0) return;
				await changeCredit({
					userId: interaction.user.id,
					change: Math.min(refundAmount, Math.abs(payment.changed)),
					reason: "Transfer Credit Refund",
				});
				await sendCreditNotification({
					user: interaction.user,
					creditChanged: Math.min(refundAmount, payment.changed),
					reason: "Transfer Credit Refund",
				});
			},
		});
		return await interaction.editReply({
			content: `Successfully transferred ${amount} credit to ${user.username}`,
			components: [],
		});
	},
} satisfies CommandFile<false>;
