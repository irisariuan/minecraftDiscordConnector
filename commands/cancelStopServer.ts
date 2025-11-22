import { MessageFlags, Poll, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	compareAnyPermissions,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import { sendApprovalPoll } from "../lib/approval";
import { isServerAlive } from "../lib/request";
import { sendCreditNotification, spendCredit } from "../lib/credit";
import { settings } from "../lib/settings";

export default {
	command: new SlashCommandBuilder()
		.setName("cancelstopserver")
		.setDescription("Cancel stop the server"),
	async execute({ interaction, serverManager }) {
		if (!interaction.guild) {
			return await interaction.reply({
				content: "This command can only be used in a server",
				flags: [MessageFlags.Ephemeral],
			});
		}

		if (!(await isServerAlive()))
			return await interaction.reply({
				content: "Server is offline",
				flags: [MessageFlags.Ephemeral],
			});
		if (
			!(await serverManager.haveServerSideScheduledShutdown()) &&
			!serverManager.haveLocalSideScheduledShutdown()
		)
			return await interaction.reply({
				content: "No scheduled shutdown found",
				flags: [MessageFlags.Ephemeral],
			});
		if (
			compareAnyPermissions(await readPermission(interaction.user), [
				PermissionFlags.stopServer,
				PermissionFlags.startServer,
			])
		) {
			await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
			let success = false;
			if (serverManager.haveLocalSideScheduledShutdown()) {
				serverManager.cancelLocalScheduledShutdown();
				success = true;
			}
			if (await serverManager.cancelServerSideShutdown()) {
				success = true;
			}
			if (!success)
				return await interaction.editReply({
					content: "Failed to cancel scheduled shutdown",
				});
			return await interaction.editReply({
				content: "Cancelled scheduled shutdown",
			});
		}
		if (
			!(await spendCredit(
				interaction.user.id,
				settings.newCancelStopServerPollFee,
				"New Cancel Stop Server Poll",
			))
		) {
			return await interaction.reply({
				content:
					"You don't have enough credit to cancel the server shutdown",
				flags: [MessageFlags.Ephemeral],
			});
		}
		await sendCreditNotification({
			user: interaction.user,
			creditChanged: -settings.newCancelStopServerPollFee,
			reason: "New Cancel Stop Server Poll",
		});

		sendApprovalPoll(interaction, {
			content: "Cancel Server Shutdown",
			options: {
				startPollFee: settings.newCancelStopServerPollFee,
				callerId: interaction.user.id,
				description: "Cancel Server Shutdown",
				async onSuccess(approval, message) {
					let success = false;
					if (serverManager.haveLocalSideScheduledShutdown()) {
						serverManager.cancelLocalScheduledShutdown();
						success = true;
					}
					if (await serverManager.cancelServerSideShutdown()) {
						success = true;
					}
					if (!success)
						return await message.edit({
							content: "No scheduled shutdown found",
						});
					return await message.edit({
						content: "Cancelled scheduled shutdown",
					});
				},
				approvalCount: 2,
				disapprovalCount: 2,
				credit: settings.cancelStopServerVoteFee,
			},
		});
	},
} as CommandFile;
