import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { updateDnsRecord } from "../lib/dnsRecord";

export default {
    command: new SlashCommandBuilder()
        .setName("refresh")
        .setDescription("Refresh DNS record, use if you cannot connect to the server"),
    async execute(interaction, client) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })

        const status = await updateDnsRecord()
        switch (status) {
            case 'ok': {
                await interaction.editReply("DNS record updated successfully")
                break
            }
            case 'noChange': {
                await interaction.editReply("DNS record has not changed, please contact the server owner if you cannot connect")
                break
            }
            case 'error': {
                await interaction.editReply("An error occurred while updating the DNS record, please contact the server owner")
                break
            }
        }
    }
} as CommandFile