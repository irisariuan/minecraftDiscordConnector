import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { PermissionFlags } from "../lib/permission";
import { setActivity } from "../lib/utils";

export default {
	command: new SlashCommandBuilder()
		.setName("suspend")
		.setDescription("Suspend the server"),
	requireServer: true,
	async execute({ interaction, client, server }) {
		server.suspendingEvent.setSuspending(true);
		console.log("Server online status updated, suspending");
		setActivity(
			client,
			(await server.isOnline.getData()) || false,
			server.suspendingEvent.isSuspending(),
			server.config.minecraftVersion,
		);
		return await interaction.reply({
			content: "Server is suspending",
			flags: MessageFlags.Ephemeral,
		});
	},
	permissions: PermissionFlags.suspend,
} satisfies CommandFile<true>;
