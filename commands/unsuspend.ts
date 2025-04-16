import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/discordCommands";
import { isSuspending, setSuspending } from "../lib/suspend";
import { PermissionFlags } from "../lib/permission";
import { serverManager } from "../lib/server";
import { setActivity } from "../lib/utils";

export default {
	command: new SlashCommandBuilder()
		.setName("unsuspend")
		.setDescription("Unsuspend the server"),
	async execute(interaction, client) {
		setSuspending(false);
		setActivity(
			client,
			(await serverManager.isOnline.getData()) || false,
			isSuspending(),
		);
		return await interaction.reply({
			content: "Server is resumed",
			flags: [MessageFlags.Ephemeral],
		});
	},
	permissions: [PermissionFlags.suspend],
} as CommandFile;
