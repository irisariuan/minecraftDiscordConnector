import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commands";
import { CacheItem } from "../lib/cache";

const ip = new CacheItem<string>(null, {
    ttl: 60 * 1000,
    interval: 60 * 1000,
    updateMethod: async () => {
        const res = await fetch("https://api.ipify.org?format=json")
        const data = await res.json() as { ip: string }
        return data.ip
    }
})

export default {
    command: new SlashCommandBuilder()
        .setName("getip")
        .setDescription("Get the IP address of the server"),
    async execute(interaction, client) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })
        const ipAddr = ip.getData()
        if (!ipAddr) {
            await interaction.editReply("Failed to fetch IP address")
            return
        }
        await interaction.editReply(`Your IP address is: ${ipAddr}`)
        console.log(`IP address fetched: ${ipAddr}`)
    }
} as CommandFile