import type { Ticket } from "../ticket";

export function formatTicketNames(
	tickets: Pick<Ticket, "name" | "ticketId">[],
	includeId = false,
) {
	return tickets
		.map(
			(t) =>
				`\`${t.name}\`${includeId ? ` (ID: \`${t.ticketId}\`)` : ""}`,
		)
		.join(", ");
}
