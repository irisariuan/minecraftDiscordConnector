import type { Ticket, TicketEffectType } from "./credit";
import {
	getRawUserTicket,
	getUserTickets,
	updateRawUserTicket,
	createTicketHistory,
	countTicketHistories,
} from "./db";

export enum TicketAction {
	Use = "use",
}

export async function getUserTicketsByUserId(
	userId: string,
	ticketTypeIds?: number[],
): Promise<Ticket[] | null> {
	const tickets = await getUserTickets(userId, ticketTypeIds);
	if (tickets.length <= 0) return null;
	return tickets.map((v) => ({
		ticketId: v.id,
		maxUse: v.maxUse ?? null,
		name: v.ticket.name,
		description: v.ticket.description,
		reason: v.reason,
		ticketTypeId: v.ticket.id,
		effect: {
			effect: v.ticket.effect as TicketEffectType,
			value: v.ticket.value,
		},
	}));
}

export async function useUserTicket(ticketId: string, reason?: string) {
	const ticket = await getRawUserTicket({
		where: { id: ticketId },
	});
	if (!ticket?.available) return false;
	if (ticket.expiresAt && ticket.expiresAt.getTime() < Date.now()) {
		if (ticket.available) {
			await updateRawUserTicket({
				where: { id: ticketId },
				data: { available: false },
			});
		}
		return false;
	}
	await createTicketHistory({
		data: { ticketId, action: TicketAction.Use, reason },
	});
	if (!ticket.maxUse || ticket.maxUse <= 0) return true;
	if ((await countTicketHistories(ticketId)) > ticket.maxUse) {
		await updateRawUserTicket({
			where: { id: ticketId },
			data: { available: false },
		});
	}
}
