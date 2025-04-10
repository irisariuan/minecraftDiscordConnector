import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/discordCommands";
import { fetchOnlinePlayers, type Player } from "../lib/request";
import { sendPaginationMessage } from "../lib/pagination";
import { CacheItem } from "../lib/cache";

const onlinePlayers = new CacheItem<Player[]>(null, {
    ttl: 1000 * 60 * 5,
    async updateMethod() {
        return await fetchOnlinePlayers()
    },
})

export default {
    command: new SlashCommandBuilder()
        .setName("onlineplayers")
        .setDescription("Get a list of online players"),
    async execute(interaction, client) {

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })

        sendPaginationMessage<Player>({
            interaction,
            options: {
                notFoundMessage: "No players found",
                title: "Online Players",
            },
            getResult: async (page, force) => {
                return await onlinePlayers.getData(force) || undefined
            },
            filterFunc: (filter) => (player => {
                if (!filter) return true
                return player.name.toLowerCase().includes(filter.toLowerCase())
            }),
            formatter: (player) => ({
                name: player.name,
                value: `ID: ${player.uuid}`,
            }),
        })
    },
} as CommandFile