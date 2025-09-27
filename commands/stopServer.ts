import { channelMention, MessageFlags, SlashCommandBuilder, userMention } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { serverManager } from "../lib/server";
import {
	comparePermission,
	getUsersWithMatchedPermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import { sendApprovalPoll } from "../lib/approval";
import { isServerAlive } from "../lib/request";
import { sendCreditNotification, spendCredit } from "../lib/credit";
import { settings } from "../lib/settings";
import { sendMessagesToUsersById } from "../lib/utils";

export default {
	command: new SlashCommandBuilder()
		.setName("stopserver")
		.setDescription("Stop the server")
		.addIntegerOption((option) =>
			option
				.setName("seconds")
				.setDescription("Delay before stopping the server")
				.setRequired(false)
				.setMinValue(0),
		)
		.addBooleanOption((option) =>
			option
				.setName("force")
				.setDescription("Force stopping the server without polling")
				.setRequired(false),
		),
	async execute(interaction, client) {
		if (!interaction.guild) {
			return await interaction.reply({
				content: "This command can only be used in a server",
				flags: [MessageFlags.Ephemeral],
			});
		}
		
		const seconds = interaction.options.getInteger("seconds") ?? 0;
		const force = interaction.options.getBoolean("force") || false;
		if (!(await isServerAlive()))
			return await interaction.reply({
				content: "Server is already offline",
				flags: [MessageFlags.Ephemeral],
			});

		if (
			(await serverManager.haveServerSideScheduledShutdown()) ||
			serverManager.haveLocalSideScheduledShutdown()
		) {
			return await interaction.reply({
				content:
					"Server is already scheduled to shutdown, please cancel it first",
				flags: [MessageFlags.Ephemeral],
			});
		}

		if (
			force &&
			comparePermission(
				await readPermission(interaction.user),
				PermissionFlags.stopServer,
			)
		) {
			await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
			const { success, promise } = await serverManager.stop(seconds * 20);
			if (!success) {
				await interaction.editReply({ content: "Failed to shutdown" });
				return;
			}
			if (seconds > 0) {
				promise?.then(() => {
					interaction
						.followUp({ content: "Server stopped successfully" })
						.catch(console.error);
				});
				return await interaction.editReply({
					content: "Stopping server is scheduled",
				});
			}
			return await interaction.editReply({
				content: "Server stopped successfully",
			});
		}
		const displayString =
			seconds > 0 ? `Stop Server in ${seconds} seconds` : "Stop Server";

		if (
			!(await spendCredit(
				interaction.user.id,
				settings.newStopServerPollFee,
				"New Stop Server Poll",
			))
		) {
			return await interaction.reply({
				content: "You don't have enough credit to stop the server",
				flags: [MessageFlags.Ephemeral],
			});
		}
		await sendCreditNotification({ user: interaction.user, creditChanged: -settings.newStopServerPollFee, reason: "New Stop Server Poll" });
		sendApprovalPoll(interaction, {
			content: displayString,
			options: {
				startPollFee: settings.newStopServerPollFee,
				callerId: interaction.user.id,
				description: displayString,
				async onSuccess(approval, message) {
					const { success, promise } = await serverManager.stop(
						seconds * 20,
					);
					if (!success)
						return await message.edit({
							content: "Failed to shutdown",
						});

					if (seconds > 0) {
						promise?.then(async () => {
							const users = await getUsersWithMatchedPermission(
								PermissionFlags.receiveNotification,
							);
							if (users) {
								sendMessagesToUsersById(
									client,
									users,
									`Server stopped with a vote by ${userMention(interaction.user.id)} at ${channelMention(interaction.channelId)}`,
								);
							}
							message
								.reply({
									content: "Server stopped successfully",
								})
								.catch(console.error);
						});
						return await message.edit({
							content: "Stopping server is scheduled",
						});
					}
					return await message.edit({
						content: "Server stopped successfully",
					});
				},
				approvalCount: 2,
				disapprovalCount: 2,
				credit: settings.stopServerVoteFee,
			},
		});
	},
} as CommandFile;
