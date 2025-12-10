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
		(await countTicketHistories(ticket.ticketId)) >= ticket.maxUse
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
		const t = {
			ticketId: ticket.id,
			maxUse: ticket.maxUse ?? null,
			name: ticket.ticket.name,
			description: ticket.ticket.description,
			reason: ticket.reason,
			ticketTypeId: ticket.ticket.id,
			effect: {
				effect: ticket.ticket.effect as TicketEffectType,
				value: ticket.ticket.value,
			},
		};
		if (usableOnly) {
			if (await isTicketAvailable(ticket)) {
				tickets.push(t);
			}
		} else {
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
}
