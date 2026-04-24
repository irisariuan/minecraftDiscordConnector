import {
	TicketEffectType,
	TicketEffectTypeNames,
	buildEffectFromValue,
	serializeEffectData,
} from "../lib/ticket";
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
			name: TicketEffectTypeNames[TicketEffectType.Multiplier],
			value: TicketEffectType.Multiplier,
			description: "Multiply the original cost by a factor",
		},
		{
			name: TicketEffectTypeNames[TicketEffectType.FixedCredit],
			value: TicketEffectType.FixedCredit,
			description: "Reduce cost by a fixed amount",
		},
		{
			name: TicketEffectTypeNames[TicketEffectType.FreeUnderCost],
			value: TicketEffectType.FreeUnderCost,
			description: "Free if cost is at or below a threshold",
		},
		{
			name: TicketEffectTypeNames[TicketEffectType.FreePlay],
			value: TicketEffectType.FreePlay,
			description: "Grant free play for a duration in hours",
		},
		{
			name: TicketEffectTypeNames[TicketEffectType.CustomApprovalCount],
			value: TicketEffectType.CustomApprovalCount,
			description: "Set a required approval count",
		},
		{
			name: TicketEffectTypeNames[TicketEffectType.RepeatApprove],
			value: TicketEffectType.RepeatApprove,
			description: "Set a maximum approval count",
		},
	],
});

const valuePrompts: Record<TicketEffectType, string> = {
	[TicketEffectType.Multiplier]:
		"Enter multiplier factor (0-1, e.g. 0.5 for 50% of original cost)",
	[TicketEffectType.FixedCredit]: "Enter fixed credit reduction amount",
	[TicketEffectType.FreeUnderCost]:
		"Enter cost threshold (free if cost ≤ threshold)",
	[TicketEffectType.FreePlay]: "Enter free play duration in hours",
	[TicketEffectType.CustomApprovalCount]: "Enter required approval count",
	[TicketEffectType.RepeatApprove]: "Enter maximum approval count",
};

const rawValue = await input({
	message: valuePrompts[effect],
	required: true,
	validate(value) {
		const num = parseFloat(value);
		if (isNaN(num)) {
			return "Please enter a valid number";
		}
		if (effect === TicketEffectType.Multiplier && (num < 0 || num > 1)) {
			return "Multiplier must be between 0 and 1";
		}
		return true;
	},
});

const value = parseFloat(rawValue);
const ticketEffect = buildEffectFromValue(effect, value);

try {
	const ticketType = await createRawTicketType({
		data: {
			id,
			name,
			description: description || null,
			effect,
			effectData: serializeEffectData(ticketEffect),
		},
	});

	console.log(`Ticket type created successfully with ID: ${ticketType.id}`);
	console.log(`Name: ${ticketType.name}`);
	if (ticketType.description)
		console.log(`Description: ${ticketType.description}`);
	console.log(`Effect: ${ticketType.effect}`);
	console.log(`Effect data: ${JSON.stringify(ticketType.effectData)}`);
} catch (error) {
	console.error("Error creating ticket type:", error);
}
