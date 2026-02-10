import { SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";

export default {
	command: new SlashCommandBuilder()
		.setName("status")
		.setDescription("Get the server status"),
	requireServer: true,
	async execute({ interaction, client, server }) {
		return await interaction.editReply({
			content: `The server ${server.config.tag ?? `*Server #${server.id}*`} is now ${(await server.isOnline.getData()) ? "online" : "offline"}${server.suspendingEvent.isSuspending() ? "(Suspending)" : ""}`,
		});
	},
} satisfies CommandFile<true>;
