import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { isSuspending, setSuspending } from "../lib/suspend";
import { PermissionFlags } from "../lib/permission";
import { serverManager } from "../lib/server";
import { setActivity } from "../lib/utils";

export default {
	command: new SlashCommandBuilder()
		.setName("suspend")
		.setDescription("Suspend the server"),
	async execute(interaction, client) {
		setSuspending(true);
		console.log("Server online status updated, suspending");
		setActivity(
			client,
			(await serverManager.isOnline.getData()) || false,
			isSuspending(),
		);
		return await interaction.reply({
			content: "Server is suspending",
			flags: [MessageFlags.Ephemeral],
		});
	},
	permissions: PermissionFlags.suspend,
} as CommandFile;
