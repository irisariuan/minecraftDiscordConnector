import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	compareAllPermissions,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import { sendApprovalPoll } from "../lib/approval";
import { parseCommandOutput, runCommandOnServer } from "../lib/request";
import { serverManager } from "../lib/server";
import { sendCreditNotification, spendCredit } from "../lib/credit";
import { settings } from "../lib/settings";

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
	async execute(interaction, client) {
		if (!interaction.guild) {
			return await interaction.reply({
				content: "This command can only be used in a server",
				flags: [MessageFlags.Ephemeral],
			});
		}
		
		const command = interaction.options.getString("command", true);
		const force = interaction.options.getBoolean("poll") === false;
		const capture = interaction.options.getInteger("capture") ?? 1000;
		const timeout = interaction.options.getInteger("timeout");
		const canRunCommand = compareAllPermissions(
			await readPermission(interaction.user.id),
			[PermissionFlags.runCommand],
		);

		if (!canRunCommand || !force) {
			if (
				!(await spendCredit(
					interaction.user.id,
					settings.newRunCommandPollFee,
					"New Run Command Poll",
				))
			) {
				return await interaction.reply({
					content: "You don't have enough credit to run this command",
					flags: [MessageFlags.Ephemeral],
				});
			}
			await sendCreditNotification(interaction.user, -settings.newRunCommandPollFee, "New Run Command Poll");
			return await sendApprovalPoll(interaction, {
				content: command,
				options: {
					startPollFee: settings.newRunCommandPollFee,
					callerId: interaction.user.id,
					description: `Command: \`${command}\``,
					async onSuccess(approval, message) {
						const output = serverManager.captureSomeOutput(capture);
						const { success } = await runCommandOnServer(
							approval.content,
						);
						if (!success) {
							await message.reply("Failed to run command");
							return;
						}
						await message.reply(
							parseCommandOutput(
								(await output)?.join("\n") || null,
								success,
							),
						);
					},
					credit: settings.runCommandVoteFee,
				},
				duration: timeout || undefined,
			});
		}
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		const output = serverManager.captureSomeOutput(capture);
		const { success } = await runCommandOnServer(command);
		await interaction.editReply(
			parseCommandOutput((await output)?.join("\n") || null, success),
		);
	},
} as CommandFile;
