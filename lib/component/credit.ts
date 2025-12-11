import { ActionRowBuilder, StringSelectMenuBuilder } from "@discordjs/builders";
import { ButtonBuilder } from "discord.js";
import { type Ticket } from "../ticket";
import { trimTextWithSuffix } from "../utils";

export enum TicketSelectMenu {
	TICKET_SELECT_ID = "ticket_select_menu",
	TICKET_SELECT_NEXT_ID = "ticket_select_next",
	TICKET_SELECT_PREV_ID = "ticket_select_prev",
	TICKET_NO_USE_ID = "ticket_no_use",
}

export function createTicketSelectMenu(tickets: Ticket[], page = 0) {
	const options = tickets
		.map((v) => ({
			label: trimTextWithSuffix(v.name, 25),
			value: v.ticketId,
			description: v.description
				? `${trimTextWithSuffix(v.description, 12)}, ID: ${v.ticketId}`
				: `No description, ID: ${v.ticketId}`,
		}))
		.slice(page * 25, (page + 1) * 25);
	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId(TicketSelectMenu.TICKET_SELECT_ID)
		.setPlaceholder("Select a Ticket to use")
		.addOptions(options);
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		selectMenu,
	);
}
export function createTicketButtons(showPrev: boolean, showNext: boolean) {
	const row = new ActionRowBuilder<ButtonBuilder>();
	const prevButton = new ButtonBuilder()
		.setCustomId(TicketSelectMenu.TICKET_SELECT_PREV_ID)
		.setLabel("Previous Page")
		.setStyle(1);
	const nextButton = new ButtonBuilder()
		.setCustomId(TicketSelectMenu.TICKET_SELECT_NEXT_ID)
		.setLabel("Next Page")
		.setStyle(1);
	const noUseButton = new ButtonBuilder()
		.setCustomId(TicketSelectMenu.TICKET_NO_USE_ID)
		.setLabel("Do Not Use a Ticket")
		.setStyle(4);
	if (showPrev) row.addComponents(prevButton);
	if (showNext) row.addComponents(nextButton);
	row.addComponents(noUseButton);
	return row;
}
