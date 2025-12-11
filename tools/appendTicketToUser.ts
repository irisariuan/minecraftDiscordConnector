import { input, select, confirm } from "@inquirer/prompts";
import {
	createRawUserTicket,
	getAllRawTicketTypes,
	getUserByIdWithoutTransactions,
} from "../lib/db";

const userId = await input({
	message: "Please enter the user ID",
	required: true,
	validate(value) {
		if (!value.trim()) {
			return "User ID is required";
		}
		return true;
	},
});

// Check if user exists
const user = await getUserByIdWithoutTransactions(userId);
if (!user) {
	console.error(
		`User with ID ${userId} not found. User will be created when ticket is assigned.`,
	);
}

// Get all available ticket types
const ticketTypes = await getAllRawTicketTypes();
if (ticketTypes.length === 0) {
	console.error(
		"No ticket types available. Please create a ticket type first using the newTicketType tool.",
	);
	process.exit(1);
}

const selectedTicketType = await select({
	message: "Please select a ticket type to assign",
	choices: ticketTypes.map((ticket) => ({
		name: `${ticket.name} (${ticket.effect}: ${ticket.value})${ticket.description ? ` - ${ticket.description}` : ""}`,
		value: ticket.id,
		description: ticket.description ?? undefined,
	})),
});

const reason = await input({
	message: "Please enter a reason for assigning this ticket (optional)",
	required: false,
});

const rawMaxUse = await input({
	message:
		"Please enter maximum uses for this ticket (default: 1, 0 for unlimited)",
	required: false,
	default: "1",
	validate(value) {
		if (!value.trim()) return true; // Allow empty for default
		const num = parseInt(value);
		if (isNaN(num) || num < 0) {
			return "Please enter a valid number (0 or greater)";
		}
		return true;
	},
});

const maxUse = rawMaxUse.trim() ? parseInt(rawMaxUse) : 1;
const maxUseValue = maxUse === 0 ? null : maxUse;

const rawExpiresAt = await input({
	message:
		"Please enter expiration date (YYYY-MM-DD HH:MM) or leave empty for no expiration",
	required: false,
	validate(value) {
		if (!value.trim()) return true; // Allow empty
		const date = new Date(value);
		if (isNaN(date.getTime())) {
			return "Please enter a valid date in YYYY-MM-DD HH:MM format";
		}
		if (date < new Date()) {
			return "Expiration date must be in the future";
		}
		return true;
	},
});

const expiresAt = rawExpiresAt.trim() ? new Date(rawExpiresAt) : null;

// Show summary and confirm
const selectedTicket = ticketTypes.find((t) => t.id === selectedTicketType);
console.log("\n=== Ticket Assignment Summary ===");
console.log(`User ID: ${userId}`);
console.log(`Ticket Type: ${selectedTicket?.name}`);
console.log(`Effect: ${selectedTicket?.effect} (${selectedTicket?.value})`);
if (selectedTicket?.description)
	console.log(`Description: ${selectedTicket.description}`);
if (reason) console.log(`Reason: ${reason}`);
console.log(`Max Uses: ${maxUse === 0 ? "Unlimited" : maxUse}`);
if (expiresAt) console.log(`Expires At: ${expiresAt.toLocaleString()}`);
console.log("================================\n");

const confirmed = await confirm({
	message: "Do you want to assign this ticket to the user?",
	default: true,
});

if (!confirmed) {
	console.log("Ticket assignment cancelled.");
	process.exit(0);
}

try {
	const userTicket = await createRawUserTicket({
		data: {
			user: {
				connectOrCreate: {
					where: { id: userId },
					create: { id: userId },
				},
			},
			ticket: {
				connect: { id: selectedTicketType },
			},
			reason: reason ?? null,
			maxUse: maxUseValue,
			expiresAt,
		},
	});

	console.log(`Ticket assigned successfully!`);
	console.log(`User Ticket ID: ${userTicket.id}`);
	console.log(`Assigned to User: ${userId}`);
	console.log(`Ticket Type: ${selectedTicket?.name}`);
	console.log(`Created At: ${userTicket.createdAt.toLocaleString()}`);
	if (userTicket.reason) console.log(`Reason: ${userTicket.reason}`);
	console.log(`Max Uses: ${userTicket.maxUse || "Unlimited"}`);
	if (userTicket.expiresAt)
		console.log(`Expires At: ${userTicket.expiresAt.toLocaleString()}`);
} catch (error) {
	console.error("Error assigning ticket to user:", error);
	process.exit(1);
}
