import { TicketEffectType } from "../lib/ticket";
import { createRawTicketType } from "../lib/db";
import { input, select } from "@inquirer/prompts";

const name = await input({
	message: "Please enter ticket type name",
	required: true,
});
const id = await input({
	message: "Please enter ticket type ID name",
	required: true,
});

const description = await input({
	message: "Please enter ticket type description (optional)",
	required: false,
});

const effect = await select({
	message: "Please select ticket effect type",
	choices: [
		{
			name: "Multiplier - Multiply the original cost by a factor",
			value: TicketEffectType.Multiplier,
			description: "e.g., 0.5 = 50% discount, 0.8 = 20% discount",
		},
		{
			name: "Fixed Credit - Reduce cost by a fixed amount",
			value: TicketEffectType.FixedCredit,
			description: "e.g., 10 = reduces cost by 10 credits",
		},
	],
});

const valueMessage =
	effect === TicketEffectType.Multiplier
		? "Please enter multiplier value (e.g., 0.5 for 50% of original cost)"
		: "Please enter fixed credit reduction amount";

const rawValue = await input({
	message: valueMessage,
	required: true,
	validate(value) {
		const num = parseFloat(value);
		if (isNaN(num)) {
			return "Please enter a valid number";
		}
		if (effect === TicketEffectType.Multiplier && (num < 0 || num > 1)) {
			return "Multiplier must be between 0 and 1";
		}
		if (effect === TicketEffectType.FixedCredit && num < 0) {
			return "Fixed credit amount must be positive";
		}
		return true;
	},
});

const value = parseFloat(rawValue);

try {
	const ticketType = await createRawTicketType({
		data: {
			id,
			name,
			description: description || null,
			effect,
			value,
		},
	});

	console.log(`Ticket type created successfully with ID: ${ticketType.id}`);
	console.log(`Name: ${ticketType.name}`);
	if (ticketType.description)
		console.log(`Description: ${ticketType.description}`);
	console.log(`Effect: ${ticketType.effect}`);
	console.log(`Value: ${ticketType.value}`);
} catch (error) {
	console.error("Error creating ticket type:", error);
}
