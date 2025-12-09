import { TicketEffectType } from "../lib/credit";
import { createRawTicketType } from "../lib/db";

createRawTicketType({
	data: {
		effect: TicketEffectType.FixedCredit,
		name: "Test Ticket Type",
		description: "A ticket type for testing purposes",
		value: 100,
		type: "standard",
	}
})