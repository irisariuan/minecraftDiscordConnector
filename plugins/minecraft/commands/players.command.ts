import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { sendPaginationMessage, type CommandFile } from "../../api";
import { isAttached } from "../runtime/ipc";
import { fetchOnlinePlayers, type Player } from "../runtime/request";

export default {
	command: new SlashCommandBuilder()
		.setName("onlineplayers")
		.setDescription("Get a list of online players"),
	requireServer: true,
	async execute({ interaction, server }) {
		if (!isAttached(server.id)) {
			return await interaction.followUp({
				content: "The connector plugin is not attached to this server",
				flags: MessageFlags.Ephemeral,
			});
		}
		sendPaginationMessage<Player>({
			interaction,
			options: {
				notFoundMessage: "No players found",
				title: "Online Players",
			},
			getResult: async () =>
				(await fetchOnlinePlayers(server.id)) ?? undefined,
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
