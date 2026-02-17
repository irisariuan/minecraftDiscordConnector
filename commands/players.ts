import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { fetchOnlinePlayers, type Player } from "../lib/serverInstance/request";
import { sendPaginationMessage } from "../lib/pagination";
import { CacheItem } from "../lib/cache";

export default {
	command: new SlashCommandBuilder()
		.setName("onlineplayers")
		.setDescription("Get a list of online players"),
	requireServer: true,
	async execute({ interaction, server }) {
		const apiPort = server.config.apiPort;
		if (apiPort === null) {
			return await interaction.followUp({
				content: "Server API is not enabled on this server",
				flags: MessageFlags.Ephemeral,
			});
		}
		const onlinePlayers = new CacheItem<Player[]>(null, {
			ttl: 1000 * 60 * 5,
			async updateMethod() {
				return await fetchOnlinePlayers(apiPort);
			},
		});
		sendPaginationMessage<Player>({
			interaction,
			options: {
				notFoundMessage: "No players found",
				title: "Online Players",
			},
			getResult: async ({ force }) =>
				(await onlinePlayers.getData(force)) ?? undefined,
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
	},
} satisfies CommandFile<true>;
