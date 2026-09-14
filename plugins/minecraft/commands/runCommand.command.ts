import {
	channelMention,
	MessageFlags,
	SlashCommandBuilder,
	time,
	userMention,
} from "discord.js";
import {
	buildInteractionFetcher,
	compareAllPermissions,
	data,
	PermissionFlags,
	sendApprovalPoll,
	sendMessagesToUsersById,
	type CommandFile,
} from "../../api";
import type { MinecraftConfig } from "../config";
import { parseCommandOutput, runCommandOnServer } from "../runtime/request";

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
			option.setName("poll").setDescription("Use poll").setRequired(false),
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
				flags: MessageFlags.Ephemeral,
			});
		}
		const { apiPort } = server.getPluginConfig() as unknown as MinecraftConfig;
		if (apiPort === null) {
			return await interaction.followUp({
				content: "Running commands is not supported on this server",
				flags: MessageFlags.Ephemeral,
			});
		}

		const command = interaction.options.getString("command", true);
		const force = interaction.options.getBoolean("poll") === false;
		const capture = interaction.options.getInteger("capture") ?? 1000;
		const timeout = interaction.options.getInteger("timeout");
		const canRunCommand = compareAllPermissions(
			await data.request("permission:read", {
				user: interaction.user,
				serverId: server.id,
			}),
			[PermissionFlags.runCommand],
		);

		if (canRunCommand && force) {
			const output = server.captureSomeOutput(capture);
			const { success } = await runCommandOnServer(apiPort, command);
			await interaction.editReply(
				parseCommandOutput((await output)?.join("\n") ?? null, success),
			);
		}
		await interaction.deleteReply();
		if (
			!(await data.request("credit:spend", {
				user: interaction.user,
				channel: interaction.channel,
				cost: server.settings.newRunCommandPollFee,
				reason: "New Run Command Poll",
				serverId: server.id,
			}))
		) {
			return await interaction.followUp({
				content: "Failed to run this command",
				flags: MessageFlags.Ephemeral,
			});
		}
		return await sendApprovalPoll(buildInteractionFetcher(interaction), {
			content: command,
			options: {
				approvalCount: server.settings.runCommandApproval,
				disapprovalCount: server.settings.runCommandDisapproval,
				startPollFee: server.settings.newRunCommandPollFee,
				callerId: interaction.user.id,
				description: `Command: \`${command}\` (${server.config.tag ?? `Server #${server.id}`})`,
				async onSuccess(approval, message) {
					const output = server.captureSomeOutput(capture);
					const { success } = await runCommandOnServer(
						apiPort,
						approval.content,
					);
					const users = await data.request("permission:getUsersWith", {
						permission: PermissionFlags.receiveNotification,
					});
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
				credit: server.settings.runCommandVoteFee,
			},
			duration: timeout ?? undefined,
			server,
		});
	},
	ephemeral: true,
	features: {
		requireStartedServer: true,
		requiredCapabilities: ["runCommand"],
	},
} satisfies CommandFile<true>;
