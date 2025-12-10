import { ActionRowBuilder, StringSelectMenuBuilder } from "@discordjs/builders";
import { calculateTicketEffect, type Ticket } from "../ticket";
import {
	ButtonBuilder,
	ComponentType,
	Message,
	MessageFlags,
} from "discord.js";
import { createRequestComponent, RequestComponentId } from "./request";
import { _ } from "../../webUi/dist/server/chunks/astro/server_DDVgKadx.mjs";

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
	if (showPrev) row.addComponents(prevButton);
	if (showNext) row.addComponents(nextButton);
	row.addComponents(noUseButton);
	return row;
}

export async function getUserSelectedTicket(
	message: Message,
	userId: string,
	tickets: Ticket[],
	originalCost: number,
): Promise<Ticket | null | undefined> {
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

	const buttonCollector = message.createMessageComponentCollector({
		componentType: ComponentType.Button,
		time,
		filter: (i) =>
			i.user.id === userId &&
			(i.customId === TicketSelectMenu.TICKET_SELECT_NEXT_ID ||
				i.customId === TicketSelectMenu.TICKET_SELECT_PREV_ID),
	});
	const selectCollector = message.createMessageComponentCollector({
		componentType: ComponentType.StringSelect,
		time,
		filter: (i) => i.user.id === userId,
	});

	buttonCollector.on("collect", async (interaction) => {
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
		new Promise<Ticket | undefined>((resolve) => {
			selectCollector.on("collect", async (interaction) => {
				const value = interaction.values[0];
				if (!value) {
					return await interaction.reply({
						content: "No ticket found!",
						flags: [MessageFlags.Ephemeral],
					});
				}
				const ticketFound = tickets.find((v) => v.ticketId === value);
				if (!ticketFound) {
					return await interaction.reply({
						content: "No ticket found!",
						flags: [MessageFlags.Ephemeral],
					});
				}
				const finalCost = calculateTicketEffect(
					ticketFound.effect,
					originalCost,
				);
				const confirmation = await interaction.reply({
					content: `After using this ticket, you will have to pay \`${finalCost}\` credits`,
					withResponse: true,
					flags: [MessageFlags.Ephemeral],
					components: [
						createRequestComponent({
							showAllow: true,
							showCancel: true,
							showDeny: false,
						}),
					],
				});
				if (!confirmation.resource?.message)
					throw new Error("No message returned");
				const finalMessage = confirmation.resource.message;
				const requestStatus = await finalMessage
					.awaitMessageComponent({
						componentType: ComponentType.Button,
						time,
						filter: (i) => i.user.id === userId,
					})
					.catch(() => null);
				if (!requestStatus) {
					await interaction.followUp({
						content: "Request timed out.",
						flags: [MessageFlags.Ephemeral],
					});
					return resolve(undefined);
				}
				if (requestStatus.customId !== RequestComponentId.Allow) {
					await requestStatus.reply({
						content:
							"Ticket application cancelled. You can choose another ticket or not use any.",
						flags: [MessageFlags.Ephemeral],
					});
					return;
				}
				await requestStatus.reply({
					content: `Ticket \`${ticketFound.name}\` applied.`,
					flags: [MessageFlags.Ephemeral],
				});
				resolve(ticketFound);
				buttonCollector.stop();
				selectCollector.stop();
			});
		}),
		message
			.awaitMessageComponent({
				componentType: ComponentType.Button,
				filter: (i) =>
					i.user.id === userId &&
					i.customId === TicketSelectMenu.TICKET_NO_USE_ID,
				time,
			})
			.then(() => null)
			.catch(() => null)
			.finally(() => {
				selectCollector.stop();
				buttonCollector.stop();
			}),
	]);
}
