import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { updateDnsRecord } from "../lib/dnsRecord";
import { sendCreditNotification, spendCredit } from "../lib/credit";
import { settings } from "../lib/settings";

export default {
	command: new SlashCommandBuilder()
		.setName("refresh")
		.setDescription(
			"Refresh DNS record, use if you cannot connect to the server",
		),
	async execute(interaction, client) {
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		if (
			await spendCredit(
				interaction.user.id,
				settings.refreshDnsFee,
				"Refresh DNS Record",
			)
		) {
			await sendCreditNotification({
				user: interaction.user,
				creditChanged: -settings.refreshDnsFee,
				reason: "Refresh DNS Record",
			});
		}
		const status = await updateDnsRecord().catch((err) => {
			console.error(err);
			return "error";
		});
		switch (status) {
			case "ok": {
				await interaction.editReply("DNS record updated successfully");
				break;
			}
			case "noChange": {
				await interaction.editReply(
					"DNS record has not changed, please contact the server owner if you cannot connect",
				);
				break;
			}
			case "error": {
				await interaction.editReply(
					"An error occurred while updating the DNS record, please contact the server owner",
				);
				break;
			}
		}
	},
} as CommandFile;
