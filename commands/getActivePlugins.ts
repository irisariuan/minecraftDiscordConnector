import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { getActivePlugins } from "../lib/plugin";

export default {
	command: new SlashCommandBuilder()
		.setName("getactiveplugins")
		.setDescription("Get the active plugins on the server")
		.addBooleanOption((option) =>
			option
				.setName("api")
				.setDescription("Use API to query active plugins")
				.setRequired(true),
		),
	requireServer: true,
	async execute({ interaction, server }) {
		const useAPI = interaction.options.getBoolean("api", true);
		const activePlugins = await getActivePlugins(
			server.config.pluginDir,
			server.config.apiPort,
			useAPI,
		);
		if (activePlugins === null)
			return await interaction.followUp({
				content: "Failed to fetch active plugins from server.",
				flags: [MessageFlags.Ephemeral],
			});
		await interaction.followUp({
			content:
				activePlugins.length > 0
					? activePlugins.join(", ")
					: "No active plugins found.",
			flags: [MessageFlags.Ephemeral],
		});
	},
} satisfies CommandFile<true>;
