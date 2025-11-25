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
import { sendCreditNotification, spendCredit } from "../lib/credit";
import { settings } from "../lib/settings";
import { sendMessagesToUsersById } from "../lib/utils";

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
				flags: [MessageFlags.Ephemeral],
			});
		}

		const force = interaction.options.getBoolean("force") || false;
		if (await server.isOnline.getData(true))
			return await interaction.followUp({
				content: "Server is already online",
				flags: [MessageFlags.Ephemeral],
			});
		const allUsingPorts = await serverManager.getAllUsingPorts();
		for (const port of allUsingPorts) {
			if (server.config.port.includes(port)) {
				return await interaction.followUp({
					content: `Cannot start server because port \`${port}\` is already in use by another server`,
					flags: [MessageFlags.Ephemeral],
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
			const pid = await server.start();
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

		if (
			!(await spendCredit({
				userId: interaction.user.id,
				cost: settings.newStartServerPollFee,
				reason: "New Start Server Poll",
				serverId: server.id,
			}))
		) {
			return await interaction.followUp({
				content: "You don't have enough credit to start the server",
				flags: [MessageFlags.Ephemeral],
			});
		}
		sendCreditNotification({
			user: interaction.user,
			creditChanged: -settings.newStartServerPollFee,
			reason: "New Start Server Poll",
			serverId: server.id,
		});

		sendApprovalPoll(interaction, {
			content: "Start Server",
			options: {
				startPollFee: settings.newStartServerPollFee,
				callerId: interaction.user.id,
				description: "Start Server",
				async onSuccess(approval, message) {
					const pid = await server.start();
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
				approvalCount: 3,
				disapprovalCount: 3,
				credit: settings.startServerVoteFee,
			},
			server,
		});
	},
	ephemeral: true,
	features: {
		requireStoppedServer: true,
	},
} satisfies CommandFile<true>;
