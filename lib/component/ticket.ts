import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export enum TicketComponentCustomId {
	Use = "ticket_use",
}

export function createTicketComponent() {
	const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(TicketComponentCustomId.Use)
			.setLabel("Use Ticket")
			.setStyle(ButtonStyle.Primary),
	);
	return actionRow;
}
