import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { serverManager } from "../lib/server";
import {
	comparePermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import { sendApprovalPoll } from "../lib/approval";
import { isServerAlive } from "../lib/request";

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
	async execute(interaction, client) {
		const force = interaction.options.getBoolean("force") || false;
		if (await isServerAlive())
			return await interaction.reply({
				content: "Server is already online",
				flags: [MessageFlags.Ephemeral],
			});

		if (
			force &&
			comparePermission(
				await readPermission(interaction.user.id),
				PermissionFlags.startServer,
			)
		) {
			await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
			const pid = await serverManager.start();
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

		sendApprovalPoll(interaction, {
			content: "Start Server",
			options: {
				description: "Start Server",
				async onSuccess(approval, message) {
					const pid = await serverManager.start();
					if (!pid) {
						await message.reply({ content: "Server is already online" });
						return;
					}
					console.log(`Server started with PID ${pid}`);
					await message.reply({ content: "Server started successfully" });
				},
				approvalCount: 3,
				disapprovalCount: 3,
			},
		});
	},
} as CommandFile;
