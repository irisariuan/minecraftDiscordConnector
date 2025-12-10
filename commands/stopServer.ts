import {
	channelMention,
	MessageFlags,
	SlashCommandBuilder,
	time,
	userMention,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	comparePermission,
	getUsersWithMatchedPermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import { sendApprovalPoll } from "../lib/approval";
import { sendMessagesToUsersById } from "../lib/utils";
import { spendCredit } from "../lib/credit";

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
	requireServer: true,
	async execute({ interaction, client, server }) {
		if (!interaction.guild) {
			return await interaction.followUp({
				content: "This command can only be used in a server",
				flags: [MessageFlags.Ephemeral],
			});
		}

		const seconds = interaction.options.getInteger("seconds") ?? 0;
		const force = interaction.options.getBoolean("force") || false;
		if (!(await server.isOnline.getData(true)))
			return await interaction.followUp({
				content: "Server is already offline",
				flags: [MessageFlags.Ephemeral],
			});

		if (
			server.config.apiPort !== null &&
			((await server.haveServerSideScheduledShutdown()) ||
				server.haveLocalSideScheduledShutdown())
		) {
			return await interaction.followUp({
				content:
					"Server is already scheduled to shutdown, please cancel it first",
				flags: [MessageFlags.Ephemeral],
			});
		}

		if (
			force &&
			comparePermission(
				await readPermission(interaction.user, server.id),
				PermissionFlags.stopServer,
			)
		) {
			const { success, promise } = await server.stop(seconds * 20);
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
		await interaction.deleteReply();
		const displayString =
			seconds > 0
				? `Stop Server in ${seconds} seconds (${server.config.tag ?? `Server #${server.id}`})`
				: `Stop Server (${server.config.tag ?? `Server #${server.id}`})`;

		if (
			!(await spendCredit(interaction, {
				userId: interaction.user.id,
				cost: server.creditSettings.newStopServerPollFee,
				reason: "New Stop Server Poll",
				serverId: server.id,
			}))
		) {
			return await interaction.reply({
				content: "You don't have enough credit to stop the server",
				flags: [MessageFlags.Ephemeral],
			});
		}
		sendApprovalPoll(interaction, {
			content: displayString,
			options: {
				startPollFee: server.creditSettings.newStopServerPollFee,
				callerId: interaction.user.id,
				description: displayString,
				async onSuccess(approval, message) {
					const { success, promise } = await server.stop(
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
									`Server stopped with a vote by ${userMention(interaction.user.id)} at ${channelMention(interaction.channelId)}  (${time(approval.createdAt)})`,
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
				approvalCount: server.approvalSettings.stopServerApproval,
				disapprovalCount: server.approvalSettings.stopServerDisapproval,
				credit: server.creditSettings.stopServerVoteFee,
			},
			server,
		});
	},
	ephemeral: true,
	features: {
		requireStartedServer: true,
	},
} satisfies CommandFile<true>;
