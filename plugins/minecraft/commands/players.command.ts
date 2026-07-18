import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { sendPaginationMessage, type CommandFile } from "../../api";
import type { MinecraftConfig } from "../config";
import { fetchOnlinePlayers, type Player } from "../runtime/request";

export default {
	command: new SlashCommandBuilder()
		.setName("onlineplayers")
		.setDescription("Get a list of online players"),
	requireServer: true,
	async execute({ interaction, server }) {
		const { apiPort } = server.getPluginConfig() as unknown as MinecraftConfig;
		if (apiPort === null) {
			return await interaction.followUp({
				content: "Server API is not enabled on this server",
				flags: MessageFlags.Ephemeral,
			});
		}
		sendPaginationMessage<Player>({
			interaction,
			options: {
				notFoundMessage: "No players found",
				title: "Online Players",
			},
			getResult: async () => (await fetchOnlinePlayers(apiPort)) ?? undefined,
			filterFunc: (filter) => (player) => {
				if (!filter) return true;
				return player.name.toLowerCase().includes(filter.toLowerCase());
			},
			formatter: (player) => ({
				name: player.name,
				value: `ID: \`${player.uuid}\``,
			}),
		});
	},
	features: {
		requireStartedServer: true,
		requiredCapabilities: ["listPlayers"],
	},
} satisfies CommandFile<true>;
