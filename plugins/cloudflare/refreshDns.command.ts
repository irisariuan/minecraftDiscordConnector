import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../../lib/commandFile";
import { updateDnsRecord, type UpdateResult } from "./lib";
import { settings } from "../../lib/settings";
import { spendCredit } from "../../lib/credit";

export default {
	command: new SlashCommandBuilder()
		.setName("refresh")
		.setDescription(
			"Refresh DNS record, use if you cannot connect to the server",
		),
	requireServer: false,
	async execute({ interaction }) {
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		await spendCredit(interaction, {
			userId: interaction.user.id,
			cost: settings.refreshDnsFee,
			reason: "Refresh DNS Record",
		});

		const status: UpdateResult = await updateDnsRecord().catch((err) => {
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
} satisfies CommandFile<false>;
