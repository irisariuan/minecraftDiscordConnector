import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { buildInteractionFetcher, sendApprovalPoll } from "../lib/approval";
import type { CommandFile } from "../lib/commandFile";
import {
	compareAnyPermissions,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import { spendCredit } from "../lib/credit";

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
			compareAnyPermissions(
				await readPermission(interaction.user, server.id),
				[PermissionFlags.stopServer, PermissionFlags.startServer],
			)
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
			!(await spendCredit(interaction, {
				userId: interaction.user.id,
				cost: server.creditSettings.newCancelStopServerPollFee,
				serverId: server.id,
				reason: "Cancel Stop Server Poll",
			}))
		) {
			return await interaction.followUp({
				content: "Failed to cancel the server shutdown",
				flags: [MessageFlags.Ephemeral],
			});
		}

		sendApprovalPoll(buildInteractionFetcher(interaction), {
			content: `Cancel Server Shutdown at ${server.config.tag ?? `Server #${server.id}`}`,
			options: {
				startPollFee: server.creditSettings.newCancelStopServerPollFee,
				callerId: interaction.user.id,
				description: `Cancel Server Shutdown (${server.config.tag ?? `Server #${server.id}`})`,
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
				approvalCount: server.approvalSettings.cancelStopServerApproval,
				disapprovalCount:
					server.approvalSettings.cancelStopServerDisapproval,
				credit: server.creditSettings.cancelStopServerVoteFee,
			},
			server,
		});
	},
	features: {
		requireStartedServer: true,
	},
} satisfies CommandFile<true>;
