import {
	getRawUserTicket,
	getUserTickets,
	createTicketHistory,
	countTicketHistories,
} from "./db";
import type {
	UserTicket as DbUserTicket,
	Ticket as DbTicketType,
} from "../generated/prisma/client";
import { type Message, ComponentType, MessageFlags } from "discord.js";
import {
	createTicketSelectMenu,
	createTicketButtons,
	TicketSelectMenu,
} from "./component/credit";
import {
	createRequestComponent,
	RequestComponentId,
} from "./component/request";
export { type DbUserTicket, type DbTicketType };
export enum TicketAction {
	Use = "use",
}

export interface Ticket {
	ticketId: string;
	ticketTypeId: string;
	name: string;
	description: string | null;
	effect: TicketEffect;
	reason: string | null;
	maxUse: number | null;
	expiresAt?: Date | null;
	histories?: TicketHistory[];
}

export interface TicketEffect {
	effect: TicketEffectType;
	value: number;
}
export enum TicketEffectType {
	Multiplier = "multiplier",
	FixedCredit = "fixed_credit",
	FreeUnderCost = "free_under_cost",
}
export const TicketEffectTypeNames: Record<TicketEffectType, string> = {
	[TicketEffectType.Multiplier]: "Multiplier",
	[TicketEffectType.FixedCredit]: "Fixed Credit",
	[TicketEffectType.FreeUnderCost]: "Free Under Cost",
};

export interface TicketHistory {
	ticketId: string;
	action: string;
	reason: string | null;
	timestamp: number;
}

export async function isTicketAvailable(
	ticket: DbUserTicket,
): Promise<boolean> {
	if (
		ticket.maxUse !== null &&
		ticket.maxUse > 0 &&
		(await countTicketHistories(ticket.id)) >= ticket.maxUse
	) {
		return false;
	}
	if (ticket.expiresAt !== null && ticket.expiresAt <= new Date()) {
		return false;
	}
	return true;
}

export function calculateTicketEffect(
	ticket: TicketEffect,
	originalCost: number,
): number {
	switch (ticket.effect) {
		case TicketEffectType.FixedCredit:
			return Math.max(0, originalCost - ticket.value);
		case TicketEffectType.Multiplier:
			return Math.max(0, Math.floor(originalCost * ticket.value));
		case TicketEffectType.FreeUnderCost:
			if (originalCost <= ticket.value) return 0;
			return originalCost;
		default: {
			console.error("Unknown ticket effect type:", ticket.effect);
			return originalCost;
		}
	}
}

export async function getUserTicketsByUserId(
	userId: string,
	ticketTypeIds?: string[],
	usableOnly = true,
): Promise<Ticket[] | null> {
	const rawTickets = await getUserTickets(userId, ticketTypeIds);
	if (rawTickets.length <= 0) return null;
	const tickets: Ticket[] = [];
	for (const ticket of rawTickets) {
		const t: Ticket = {
			ticketId: ticket.id,
			maxUse: ticket.maxUse ?? null,
			name: ticket.ticket.name,
			description: ticket.ticket.description,
			reason: ticket.reason,
			ticketTypeId: ticket.ticket.id,
			expiresAt: ticket.expiresAt,
			effect: {
				effect: ticket.ticket.effect as TicketEffectType,
				value: ticket.ticket.value,
			},
			histories: ticket.history.map((h) => ({
				action: h.action,
				reason: h.reason,
				ticketId: h.ticketId,
				timestamp: h.timestamp.getTime(),
			})),
		};
		if (usableOnly && (await isTicketAvailable(ticket))) {
			tickets.push(t);
		} else if (!usableOnly) {
			tickets.push(t);
		}
	}
	return tickets;
}

export async function useUserTicket(ticketId: string, reason?: string) {
	const ticket = await getRawUserTicket({
		where: { id: ticketId },
	});
	if (!ticket || !(await isTicketAvailable(ticket))) return false;
	await createTicketHistory({
		data: { ticketId, action: TicketAction.Use, reason },
	});
	return true;
}

interface GetUserSelectedTicketReturn<UseTicket extends boolean> {
	useTicket: UseTicket;
	ticket: UseTicket extends true ? Ticket : null;
	cancelled: UseTicket extends false ? boolean : false;
}

export async function getUserSelectedTicket(
	message: Message,
	userId: string,
	tickets: Ticket[],
	originalCost: number,
): Promise<GetUserSelectedTicketReturn<boolean>> {
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
		new Promise<GetUserSelectedTicketReturn<boolean>>((resolve) => {
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
					return resolve({
						cancelled: true,
						useTicket: false,
						ticket: null,
					});
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
				resolve({
					useTicket: true,
					ticket: ticketFound,
					cancelled: false,
				});
				buttonCollector.stop();
				selectCollector.stop();
			});
		}),
		message
			.awaitMessageComponent({
				componentType: ComponentType.Button,
				filter: (i) =>
					i.user.id === userId &&
					(i.customId === TicketSelectMenu.TICKET_NO_USE_ID ||
						i.customId === TicketSelectMenu.TICKET_CANCEL_ID),
				time,
			})
			.then(
				(interaction) =>
					({
						cancelled:
							interaction.customId ===
							TicketSelectMenu.TICKET_CANCEL_ID,
						useTicket: false,
						ticket: null,
					}) satisfies GetUserSelectedTicketReturn<false>,
			)
			.catch(
				() =>
					({
						useTicket: false,
						ticket: null,
						cancelled: true,
					}) satisfies GetUserSelectedTicketReturn<false>,
			)
			.finally(() => {
				selectCollector.stop();
				buttonCollector.stop();
			}),
	]);
}
