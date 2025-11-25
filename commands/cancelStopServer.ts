import { MessageFlags, Poll, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	compareAnyPermissions,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import { sendApprovalPoll } from "../lib/approval";
import { sendCreditNotification, spendCredit } from "../lib/credit";
import { settings } from "../lib/settings";

export default {
	command: new SlashCommandBuilder()
		.setName("cancelstopserver")
		.setDescription("Cancel stop the server"),
	requireServer: true,
	async execute({ interaction, server }) {
		if (!interaction.guild) {
			return await interaction.followUp({
				content: "This command can only be used in a server",
				flags: [MessageFlags.Ephemeral],
			});
		}

		if (!(await server.isOnline.getData(true)))
			return await interaction.followUp({
				content: "Server is offline",
				flags: [MessageFlags.Ephemeral],
			});
		if (server.config.apiPort === null) {
			return await interaction.followUp({
				content:
					"Server-side scheduled shutdown is not supported on this server",
				flags: [MessageFlags.Ephemeral],
			});
		}
		if (
			!(await server.haveServerSideScheduledShutdown()) &&
			!server.haveLocalSideScheduledShutdown()
		)
			return await interaction.followUp({
				content: "No scheduled shutdown found",
				flags: [MessageFlags.Ephemeral],
			});
		if (
			compareAnyPermissions(await readPermission(interaction.user, server.id), [
				PermissionFlags.stopServer,
				PermissionFlags.startServer,
			])
		) {
			let success = false;
			if (server.haveLocalSideScheduledShutdown()) {
				server.cancelLocalScheduledShutdown();
				success = true;
			}
			if (await server.cancelServerSideShutdown()) {
				success = true;
			}
			if (!success)
				return await interaction.followUp({
					content: "Failed to cancel scheduled shutdown",
					flags: [MessageFlags.Ephemeral],
				});
			return await interaction.followUp({
				content: "Cancelled scheduled shutdown",
				flags: [MessageFlags.Ephemeral],
			});
		}
		if (
			!(await spendCredit({
				userId: interaction.user.id,
				cost: settings.newCancelStopServerPollFee,
				serverId: server.id,
				reason: "New Cancel Stop Server Poll",
			}))
		) {
			return await interaction.followUp({
				content:
					"You don't have enough credit to cancel the server shutdown",
				flags: [MessageFlags.Ephemeral],
			});
		}
		await sendCreditNotification({
			user: interaction.user,
			creditChanged: -settings.newCancelStopServerPollFee,
			reason: "New Cancel Stop Server Poll",
			serverId: server.id,
		});

		sendApprovalPoll(interaction, {
			content: "Cancel Server Shutdown",
			options: {
				startPollFee: settings.newCancelStopServerPollFee,
				callerId: interaction.user.id,
				description: "Cancel Server Shutdown",
				async onSuccess(approval, message) {
					let success = false;
					if (server.haveLocalSideScheduledShutdown()) {
						server.cancelLocalScheduledShutdown();
						success = true;
					}
					if (await server.cancelServerSideShutdown()) {
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
			server,
		});
	},
	features: {
		requireStartedServer: true,
	},
} satisfies CommandFile<true>;
