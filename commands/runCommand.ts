import {
	channelMention,
	MessageFlags,
	SlashCommandBuilder,
	time,
	userMention,
} from "discord.js";
import { sendApprovalPoll } from "../lib/approval";
import type { CommandFile } from "../lib/commandFile";
import {
	compareAllPermissions,
	getUsersWithMatchedPermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import { parseCommandOutput, runCommandOnServer } from "../lib/request";
import { sendMessagesToUsersById } from "../lib/utils";
import { spendCredit } from "../lib/credit";

export default {
	command: new SlashCommandBuilder()
		.setName("runcommand")
		.setDescription("Run a command on the server")
		.addStringOption((option) =>
			option
				.setName("command")
				.setDescription("The command to run")
				.setRequired(true),
		)
		.addBooleanOption((option) =>
			option
				.setName("poll")
				.setDescription("Use poll")
				.setRequired(false),
		)
		.addIntegerOption((option) =>
			option
				.setName("timeout")
				.setDescription("Approval timeout in milliseconds")
				.setRequired(false)
				.setMinValue(100)
				.setMaxValue(60000),
		)
		.addIntegerOption((option) =>
			option
				.setName("capture")
				.setDescription("Capture output in milliseconds")
				.setRequired(false)
				.setMinValue(1000)
				.setMaxValue(60000),
		),
	requireServer: true,
	async execute({ interaction, client, server }) {
		if (!interaction.guild) {
			return await interaction.followUp({
				content: "This command can only be used in a server",
				flags: [MessageFlags.Ephemeral],
			});
		}
		if (server.config.apiPort === null) {
			return await interaction.followUp({
				content: "Running commands is not supported on this server",
				flags: [MessageFlags.Ephemeral],
			});
		}

		const command = interaction.options.getString("command", true);
		const force = interaction.options.getBoolean("poll") === false;
		const capture = interaction.options.getInteger("capture") ?? 1000;
		const timeout = interaction.options.getInteger("timeout");
		const canRunCommand = compareAllPermissions(
			await readPermission(interaction.user, server.id),
			[PermissionFlags.runCommand],
		);

		if (canRunCommand && force) {
			const output = server.captureSomeOutput(capture);
			const { success } = await runCommandOnServer(
				server.config.apiPort,
				command,
			);
			await interaction.editReply(
				parseCommandOutput((await output)?.join("\n") ?? null, success),
			);
		}
		await interaction.deleteReply();
		if (
			!(await spendCredit(interaction, {
				userId: interaction.user.id,
				cost: server.creditSettings.newRunCommandPollFee,
				reason: "New Run Command Poll",
				serverId: server.id,
			}))
		) {
			return await interaction.followUp({
				content: "You don't have enough credit to run this command",
				flags: [MessageFlags.Ephemeral],
			});
		}
		return await sendApprovalPoll(interaction, {
			content: command,
			options: {
				approvalCount: server.approvalSettings.runCommandApproval,
				disapprovalCount: server.approvalSettings.runCommandDisapproval,
				startPollFee: server.creditSettings.newRunCommandPollFee,
				callerId: interaction.user.id,
				description: `Command: \`${command}\` (${server.config.tag ?? `Server #${server.id}`})`,
				async onSuccess(approval, message) {
					if (!server.config.apiPort)
						return await message.reply(
							"Running commands is not supported on this server",
						);
					const output = server.captureSomeOutput(capture);
					const { success } = await runCommandOnServer(
						server.config.apiPort,
						approval.content,
					);
					const users = await getUsersWithMatchedPermission(
						PermissionFlags.receiveNotification,
					);
					if (users) {
						sendMessagesToUsersById(
							client,
							users,
							`Command \`${command}\` executed with a vote by ${userMention(interaction.user.id)} at ${channelMention(interaction.channelId)} (${time(approval.createdAt)})`,
						);
					}
					if (!success) {
						await message.reply("Failed to run command");
						return;
					}
					await message.reply(
						parseCommandOutput(
							(await output)?.join("\n") ?? null,
							success,
						),
					);
				},
				credit: server.creditSettings.runCommandVoteFee,
			},
			duration: timeout ?? undefined,
			server,
		});
	},
	ephemeral: true,
	features: {
		requireStartedServer: true,
	},
} satisfies CommandFile<true>;
