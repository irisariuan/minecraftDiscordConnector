import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../../api";
import type { MinecraftConfig } from "../config";
import { getActivePlugins } from "../runtime/pluginDir";

export default {
	command: new SlashCommandBuilder()
		.setName("lsplugins")
		.setDescription("List plugin files currently present on disk"),

	requireServer: true,

	async execute({ interaction, server }) {
		const { pluginDir } = server.getPluginConfig() as unknown as MinecraftConfig;
		const activePlugins = await getActivePlugins(pluginDir);

		if (activePlugins === null) {
			await interaction.followUp({
				content: "Failed to read the plugin directory.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await interaction.followUp({
			content:
				activePlugins.length > 0
					? `**${activePlugins.length} file(s) on disk:**\n${activePlugins.join(", ")}`
					: "No plugin files found on disk.",
			flags: MessageFlags.Ephemeral,
		});
	},
} satisfies CommandFile<true>;
