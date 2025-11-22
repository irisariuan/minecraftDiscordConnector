import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { PermissionFlags } from "../lib/permission";
import { setActivity } from "../lib/utils";

export default {
	command: new SlashCommandBuilder()
		.setName("unsuspend")
		.setDescription("Unsuspend the server"),
	async execute({ interaction, client, serverManager }) {
		serverManager.suspendingEvent.setSuspending(false);
		setActivity(
			client,
			(await serverManager.isOnline.getData()) || false,
			serverManager.suspendingEvent.isSuspending(),
		);
		return await interaction.reply({
			content: "Server is resumed",
			flags: [MessageFlags.Ephemeral],
		});
	},
	permissions: PermissionFlags.suspend,
} as CommandFile;
