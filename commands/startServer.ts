import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { serverManager } from "../lib/server";
import {
	comparePermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import { sendApprovalPoll } from "../lib/approval";
import { isServerAlive } from "../lib/request";
import { sendCreditNotification, spendCredit } from "../lib/credit";
import { settings } from "../lib/settings";

export default {
	command: new SlashCommandBuilder()
		.setName("startserver")
		.setDescription("Start the server")
		.addBooleanOption((option) =>
			option
				.setName("force")
				.setDescription("Force start the server without polling")
				.setRequired(false),
		),
	async execute(interaction, client) {
		if (!interaction.guild) {
			return await interaction.reply({
				content: "This command can only be used in a server",
				flags: [MessageFlags.Ephemeral],
			});
		}

		const force = interaction.options.getBoolean("force") || false;
		if (await isServerAlive())
			return await interaction.reply({
				content: "Server is already online",
				flags: [MessageFlags.Ephemeral],
			});

		if (
			force &&
			comparePermission(
				await readPermission(interaction.user),
				PermissionFlags.startServer,
			)
		) {
			await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
			const pid = await serverManager.start();
			if (!pid) {
				return await interaction.editReply({
					content: "Server is already online",
				});
			}
			console.log(`Server started with PID ${pid}`);
			return await interaction.editReply({
				content: "Server started successfully",
			});
		}

		if (
			!(await spendCredit(
				interaction.user.id,
				settings.newStartServerPollFee,
				"New Start Server Poll",
			))
		) {
			return await interaction.reply({
				content: "You don't have enough credit to start the server",
				flags: [MessageFlags.Ephemeral],
			});
		}
		sendCreditNotification(
			{ user: interaction.user, creditChanged: -settings.newStartServerPollFee, reason: "New Start Server Poll" },
		);

		sendApprovalPoll(interaction, {
			content: "Start Server",
			options: {
				startPollFee: settings.newStartServerPollFee,
				callerId: interaction.user.id,
				description: "Start Server",
				async onSuccess(approval, message) {
					const pid = await serverManager.start();
					if (!pid) {
						await message.reply({
							content: "Server is already online",
						});
						return;
					}
					console.log(`Server started with PID ${pid}`);
					await message.reply({
						content: "Server started successfully",
					});
				},
				approvalCount: 3,
				disapprovalCount: 3,
				credit: settings.startServerVoteFee,
			},
		});
	},
} as CommandFile;
