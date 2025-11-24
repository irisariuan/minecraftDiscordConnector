import { SlashCommandBuilder, time } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { sendPaginationMessage } from "../lib/pagination";
import { PermissionFlags } from "../lib/permission";

export default {
	command: new SlashCommandBuilder()
		.setName("log")
		.setDescription("Get the server log")
		.addStringOption((option) =>
			option
				.setName("filter")
				.setDescription("Filter the log by keyword")
				.setRequired(false),
		),
	async execute({ interaction, server }) {
		const filter = interaction.options.getString("filter");

		sendPaginationMessage({
			interaction,
			options: {
				filter: filter || undefined,
			},
			async getResult() {
				return server.outputLines;
			},
			filterFunc: (filter) => (log) => {
				if (!filter) return true;
				return (
					log.type.includes(filter) || log.message.includes(filter)
				);
			},
			formatter: (log) => {
				return {
					name: log.type.toUpperCase(),
					value: `${log.timestamp ? time(new Date(log.timestamp)) : "Unknown Time"}\n${log.message}`,
				};
			},
		});
	},
	permissions: PermissionFlags.readLog,
	ephemeral: true,
} as CommandFile<true>;
