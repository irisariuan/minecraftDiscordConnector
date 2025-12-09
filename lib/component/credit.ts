import { ActionRowBuilder, StringSelectMenuBuilder } from "@discordjs/builders";
import type { Ticket } from "../credit";
import { ButtonBuilder, ComponentType, Message } from "discord.js";

export enum TicketSelectMenu {
	TICKET_SELECT_ID = "ticket_select_menu",
	TICKET_SELECT_NEXT_ID = "ticket_select_next",
	TICKET_SELECT_PREV_ID = "ticket_select_prev",
	TICKET_NO_USE_ID = "ticket_no_use",
}

export function createTicketSelectMenu(tickets: Ticket[], page = 0) {
	const options = tickets
		.map((v) => ({
			label: v.name,
			value: v.ticketId,
			description: v.description || undefined,
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
	row.addComponents(prevButton, noUseButton, nextButton);
	return row;
}

export async function getUsingTicketId(
	message: Message,
	userId: string,
	tickets: Ticket[],
): Promise<Ticket | null> {
	const time = 1000 * 60 * 2;
	const indexPage = 0;
	await message.edit({
		components: [
			createTicketSelectMenu(tickets, indexPage),
			createTicketButtons(
				indexPage > 0,
				tickets.length > (indexPage + 1) * 25,
			),
		],
	});

	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.Button,
		time,
		filter: (i) =>
			i.user.id === userId &&
			(i.customId === TicketSelectMenu.TICKET_SELECT_NEXT_ID ||
				i.customId === TicketSelectMenu.TICKET_SELECT_PREV_ID),
	});
	collector.on("collect", async (interaction) => {
		await interaction.deferUpdate();
		let newPage = indexPage;
		if (interaction.customId === TicketSelectMenu.TICKET_SELECT_NEXT_ID) {
			newPage += 1;
		} else if (
			interaction.customId === TicketSelectMenu.TICKET_SELECT_PREV_ID
		) {
			newPage = Math.max(0, newPage - 1);
		}
		// Update the select menu and buttons
		await message.edit({
			components: [
				createTicketSelectMenu(tickets, newPage),
				createTicketButtons(
					newPage > 0,
					tickets.length > (newPage + 1) * 25,
				),
			],
		});
	});
	return Promise.race([
		message
			.awaitMessageComponent({
				componentType: ComponentType.StringSelect,
				filter: (i) => i.user.id === userId,
				time,
			})
			.then((interaction) => {
				collector.stop();

				return (
					tickets.find((v) => v.ticketId === interaction.values[0]) ??
					null
				);
			})
			.catch(() => null),
		message
			.awaitMessageComponent({
				componentType: ComponentType.Button,
				filter: (i) =>
					i.user.id === userId &&
					i.customId === TicketSelectMenu.TICKET_NO_USE_ID,
				time,
			})
			.then(() => {
				collector.stop();
				return null;
			})
			.catch(() => null),
	]);
}
