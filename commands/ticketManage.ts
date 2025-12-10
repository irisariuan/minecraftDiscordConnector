import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { PermissionFlags } from "../lib/permission";
import { initTicketGroup, ticketHandler } from "./ticketManage/ticket";
import {
	initTicketTypeGroup,
	ticketTypeHandler,
} from "./ticketManage/ticketType";

export default {
	command: new SlashCommandBuilder()
		.setName("ticket")
		.setDescription("Manage tickets and ticket types")
		.addSubcommandGroup((group) => initTicketGroup(group))
		.addSubcommandGroup((group) => initTicketTypeGroup(group)),

	async execute({ interaction }) {
		const group = interaction.options.getSubcommandGroup(true);

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		switch (group) {
			case "ticket": {
				return await ticketHandler(interaction);
			}
			case "type": {
				return await ticketTypeHandler(interaction);
			}
			default:
				await interaction.editReply({
					content: "Unknown subcommand group",
				});
				return;
		}
	},
	requireServer: false,
	features: {
		suspendable: false,
	}
} satisfies CommandFile<false>;
