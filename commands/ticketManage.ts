import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	initTicketGroup,
	ticketHandler,
	handleTicketAutocomplete,
} from "./ticketManage/ticket";
import {
	handleTicketTypeAutocomplete,
	initTicketTypeGroup,
	ticketTypeHandler,
} from "./ticketManage/ticketType";

export default {
	command: new SlashCommandBuilder()
		.setName("managetickets")
		.setDescription("Manage tickets and ticket types")
		.addSubcommandGroup((group) => initTicketGroup(group))
		.addSubcommandGroup((group) => initTicketTypeGroup(group)),
	async autoComplete({ interaction }) {
		const group = interaction.options.getSubcommandGroup();

		switch (group) {
			case "ticket": {
				return await handleTicketAutocomplete(interaction);
			}
			case "type": {
				return await handleTicketTypeAutocomplete(interaction);
			}
			default:
				return await interaction.respond([]);
		}
	},
	async execute({ interaction }) {
		const group = interaction.options.getSubcommandGroup(true);

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
		unsuspendable: true,
	},
} satisfies CommandFile<false>;
