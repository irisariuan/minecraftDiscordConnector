import {
	ComponentType,
	Message,
	MessageFlags,
	SlashCommandBuilder,
	StringSelectMenuInteraction,
	time,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	createTicketComponent,
	TicketComponentCustomId,
} from "../lib/component/ticket";
import { createTicketEmbed } from "../lib/embed/ticket";
import { sendPaginationMessage } from "../lib/pagination";
import {
	getUserTicketsByUserId,
	isTicketAvailable,
	type Ticket,
	TicketEffectTypeNames,
	userUsableTicketEffects,
	useUserTicket,
} from "../lib/ticket";
import { trimTextWithSuffix } from "../lib/utils";
import { ticketEffectManager } from "../lib/ticket/effect";

export default {
	command: new SlashCommandBuilder()
		.setName("useticket")
		.setDescription("Use a ticket"),
	requireServer: false,
	features: {
		unsuspendable: true,
	},
	async execute({ interaction }) {
		await sendPaginationMessage({
			interaction,
			getResult: async () => {
				const tickets = await getUserTicketsByUserId({
					userId: interaction.user.id,
					usableOnly: false,
					ticketEffectTypes: userUsableTicketEffects,
				});
				return (
					tickets?.toSorted((a, b) => {
						// sort by availability, then by expiration date (soonest first), then by use count
						return (
							Number(isTicketAvailable(b)) -
								Number(isTicketAvailable(a)) ||
							(a.expiresAt?.getTime() ?? Infinity) -
								(b.expiresAt?.getTime() ?? Infinity) ||
							(a.histories?.length ?? 0) -
								(b.histories?.length ?? 0)
						);
					}) ?? []
				);
			},
			formatter: (ticket: Ticket) => {
				const useCount = ticket.histories?.length ?? 0;
				const maxUseText =
					ticket.maxUse !== null && ticket.maxUse > 0
						? ` (${useCount}/${ticket.maxUse} uses)`
						: ` (Used ${useCount} times)`;

				// Add expiration info if ticket has an expiration date
				let expireText = "No expiration date";
				let isExpired = false;
				if (ticket.expiresAt) {
					const expireDate = new Date(ticket.expiresAt);
					const now = new Date();
					isExpired = expireDate <= now;
					expireText = isExpired
						? `**Expired** at ${time(expireDate)}`
						: `Expires at ${time(expireDate)}`;
				}

				return {
					name: `${ticket.name}`,
					value: `Ticket ID: \`${ticket.ticketId}\`\nTicket Type ID: \`${ticket.ticketTypeId}\`\nEffect: ${
						TicketEffectTypeNames[ticket.effect.effect] ??
						"Unknown effect"
					} (${ticket.effect.value})\n${
						ticket.description || "No description"
					}\n${expireText}\nAvailability: ${
						isTicketAvailable(ticket)
							? "✅ Usable"
							: "❌ Not usable"
					}${maxUseText}`,
				};
			},
			filterFunc: (filter?: string) => (ticket: Ticket) => {
				if (!filter) return true;
				const searchText = filter.toLowerCase();
				return (
					ticket.name.toLowerCase().includes(searchText) ||
					ticket.ticketTypeId.toLowerCase().includes(searchText) ||
					ticket.ticketId.toLowerCase().includes(searchText) ||
					(ticket.description?.toLowerCase().includes(searchText) ??
						false)
				);
			},
			options: {
				title: `Tickets for ${interaction.user.username}`,
				mainColor: "Blue",
				notFoundMessage: "You have no usable tickets.",
			},
			interactionFilter: (i) => i.user.id === interaction.user.id,
			selectMenuTransform: (ticket: Ticket, index: number) => ({
				label: trimTextWithSuffix(ticket.name, 100),
				value: ticket.ticketId,
				description: ticket.description
					? `${trimTextWithSuffix(ticket.description, 50)}, ID: ${ticket.ticketId}`
					: `No description, ID: ${ticket.ticketId}`,
			}),
			onItemSelected: async (menuInteraction, result) => {
				await menuInteraction.deferReply({
					flags: MessageFlags.Ephemeral,
				});
				const tickets = await result.getData();
				const ticket = tickets?.find(
					(t) => t.ticketId === menuInteraction.values[0],
				);
				if (!ticket) return false;
				const reply = await menuInteraction.editReply({
					embeds: [
						createTicketEmbed(
							ticket,
							interaction.user.username,
							interaction.user.username,
						),
					],
					components: [createTicketComponent()],
				});
				return handleReply(menuInteraction, reply, ticket);
			},
		});
	},
} satisfies CommandFile<false>;

async function handleReply(
	interaction: StringSelectMenuInteraction,
	message: Message,
	ticket: Ticket,
): Promise<boolean> {
	const response = await message
		.awaitMessageComponent({
			componentType: ComponentType.Button,
			filter: (i) =>
				i.customId === TicketComponentCustomId.Use &&
				i.user.id === interaction.user.id,
			time: 60_000,
		})
		.catch(() => null);
	if (!response) {
		await interaction.editReply({
			components: [],
		});
		return false;
	}
	await useUserTicket(ticket.ticketId, "Used via /useticket command");
	const usage = ticketEffectManager.use(
		interaction.user.id,
		ticket.ticketId,
		ticket.effect,
	);
	if (usage)
		await response.update({
			content: `You have used the ticket **${ticket.name}**!`,
			embeds: [],
			components: [],
		});
	else {
		const usage = ticketEffectManager.get(ticket.ticketId);
		if (!usage) throw new Error("Failed to get ticket usage info");
		await response.update({
			content: `The ticket **${ticket.name}** is currently in use and cannot be used again until the effect expires at ${time(usage.expireTime)}.`,
			embeds: [],
			components: [],
		});
	}
	return true;
}
