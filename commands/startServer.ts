import {
	channelMention,
	MessageFlags,
	SlashCommandBuilder,
	time,
	userMention,
} from "discord.js";
import { buildInteractionFetcher, sendApprovalPoll } from "../lib/approval";
import type { CommandFile } from "../lib/commandFile";
import { spendCredit } from "../lib/credit";
import {
	comparePermission,
	getUsersWithMatchedPermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";

import { sendMessagesToUsersById } from "../lib/utils";
import { TicketEffectType } from "../lib/ticket";

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
	requireServer: true,
	async execute({ interaction, client, server, serverManager }) {
		if (!interaction.guild) {
			return await interaction.followUp({
				content: "This command can only be used in a server",
				flags: MessageFlags.Ephemeral,
			});
		}

		const force = interaction.options.getBoolean("force") ?? false;
		if (await server.isOnline.getData(true))
			return await interaction.followUp({
				content: "Server is already online",
				flags: MessageFlags.Ephemeral,
			});
		const allUsingPorts = await serverManager.getAllUsingPorts();
		for (const port of allUsingPorts) {
			if (server.config.port.includes(port)) {
				return await interaction.followUp({
					content: `Cannot start server because port \`${port}\` is already in use by another server`,
					flags: MessageFlags.Ephemeral,
				});
			}
		}
		if (
			force &&
			comparePermission(
				await readPermission(interaction.user, server.id),
				PermissionFlags.startServer,
			)
		) {
			const pid = await server.start(serverManager);
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
		await interaction.deleteReply();

		const transaction = await spendCredit(interaction.channel, {
			user: interaction.user,
			cost: server.creditSettings.newStartServerPollFee,
			reason: "New Start Server Poll",
			serverId: server.id,
		});
		if (!transaction) {
			return await interaction.followUp({
				content: "Failed to start the server",
				flags: MessageFlags.Ephemeral,
			});
		}
		let approvalCount = server.approvalSettings.startServerApproval;
		const customApprovalTicket = transaction.ticketUsed?.find(
			(t) => t.effect.effect === TicketEffectType.CustomApprovalCount,
		);
		if (
			customApprovalTicket &&
			customApprovalTicket.effect?.value !== null &&
			Number.isInteger(customApprovalTicket?.effect?.value)
		) {
			approvalCount = customApprovalTicket.effect.value;
		}
		if (approvalCount === 0) {
			const pid = await server.start(serverManager);
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

		sendApprovalPoll(buildInteractionFetcher(interaction), {
			content: `Start Server at ${server.config.tag ?? `Server #${server.id}`}`,
			options: {
				async canRepeatApprove({ user, approval, server }) {
					if (!approval.options.credit) return false;
					const approvalCount =
						approval.approvalIds.filter((id) => id === user.id)
							.length +
						approval.disapprovalIds.filter((id) => id === user.id)
							.length;
					const transaction = await spendCredit(interaction.channel, {
						cost: approval.options.credit,
						reason: "Start Server Vote",
						user,
						serverId: server.id,
						acceptedTicketTypeIds: [TicketEffectType.RepeatApprove],
						mustUseTickets: true,
						onBeforeSpend: async ({ tickets }) => {
							if (!tickets) return false;
							return !!tickets.find(
								(t) =>
									t.effect.effect ===
										TicketEffectType.RepeatApprove &&
									t.effect.value !== null &&
									t.effect.value >= approvalCount + 1, // +1 because the current vote has not been counted in approvalCount yet
							);
						},
					});
					return !!transaction;
				},
				startPollFee: server.creditSettings.newStartServerPollFee,
				callerId: interaction.user.id,
				description: `Start Server (${server.config.tag ?? `Server #${server.id}`})`,
				async onSuccess(approval, message) {
					const pid = await server.start(serverManager);
					if (!pid) {
						await message.reply({
							content: "Server is already online",
						});
						return;
					}
					console.log(`Server started with PID ${pid}`);
					const users = await getUsersWithMatchedPermission(
						PermissionFlags.receiveNotification,
					);
					if (users) {
						sendMessagesToUsersById(
							client,
							users,
							`Server started with a vote by ${userMention(interaction.user.id)} at ${channelMention(interaction.channelId)} (${time(approval.createdAt)})`,
						);
					}
					await message.reply({
						content: "Server started successfully",
					});
				},
				approvalCount,
				disapprovalCount:
					server.approvalSettings.startServerDisapproval,
				credit: server.creditSettings.startServerVoteFee,
			},
			server,
		});
	},
	ephemeral: true,
	features: {
		requireStoppedServer: true,
	},
} satisfies CommandFile<true>;
