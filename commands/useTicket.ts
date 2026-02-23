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
import {
	createTicketEmbed,
	createTicketsUsageEmbed,
} from "../lib/embed/ticket";
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
import type { TicketUsage } from "../lib/utils/ticket";

export default {
	command: new SlashCommandBuilder()
		.setName("useticket")
		.setDescription("Use a ticket")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("use")
				.setDescription("Select one ticket to use"),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("check")
				.setDescription("Check your active tickets"),
		),
	requireServer: false,
	features: {
		unsuspendable: true,
	},
	async execute({ interaction }) {
		const subcommand = interaction.options.getSubcommand();
		if (subcommand === "check") {
			const activeEffects = ticketEffectManager.getUserActiveEffects(
				interaction.user.id,
			);
			if (activeEffects.length === 0) {
				await interaction.reply({
					content: "You have no active ticket effects.",
					flags: MessageFlags.Ephemeral,
				});
				return;
			}
			const effectDescriptions = activeEffects
				.map(({ ticket, ticketId }) => {
					const expireDate = new Date(ticket.expireTime);
					return `Effect: ${TicketEffectTypeNames[ticket.effect.effect] ?? "Unknown effect"} (${ticket.effect.value}), expires at ${time(expireDate)} (Ticket ID: \`${ticketId}\`)`;
				})
				.join("\n");
			await interaction.reply({
				content: `Your active ticket effects:\n${effectDescriptions}`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await sendPaginationMessage({
			interaction,
			async getResult() {
				const tickets = await getUserTicketsByUserId({
					userId: interaction.user.id,
					usableOnly: false,
					ticketEffectTypes: userUsableTicketEffects,
				});
				return (
					tickets
						?.filter((ticket) => isTicketAvailable(ticket))
						?.toSorted((a, b) => {
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
			formatter(ticket: Ticket) {
				const useCount = ticket.histories?.length ?? 0;
				const maxUseText =
					ticket.maxUse !== null && ticket.maxUse > 0
						? ` ${useCount}/${ticket.maxUse} uses`
						: ` Used ${useCount} times (Unlimited uses)`;

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
					}\n${expireText}\n${maxUseText}`,
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
			selectMenuOptions: {
				showSelectMenu: true,
				// limit to select up to 5 tickets at once, to prevent abuse of using too many tickets at once and 
				// hitting text limits or embed limits
				maxSelect: (opt) => Math.min(opt.length, 5),
			},
			selectMenuTransform: (ticket: Ticket) => ({
				label: trimTextWithSuffix(ticket.name, 100),
				value: ticket.ticketId,
				description: ticket.description
					? `${trimTextWithSuffix(ticket.description, 50)}, ID: ${ticket.ticketId}`
					: `No description, ID: ${ticket.ticketId}`,
			}),
			async onItemSelected(menuInteraction, result) {
				await menuInteraction.deferReply({
					flags: MessageFlags.Ephemeral,
				});
				const tickets = await result.getData();
				const usedTickets = tickets?.filter((t) =>
					menuInteraction.values.includes(t.ticketId),
				);
				if (!usedTickets) return false;
				const reply = await menuInteraction.editReply({
					embeds: [
						...(tickets?.map((ticket) =>
							createTicketEmbed(
								ticket,
								interaction.user.username,
								interaction.user.username,
							),
						) ?? []),
					],
					components: [createTicketComponent()],
				});
				return handleReply(menuInteraction, reply, usedTickets);
			},
		});
	},
} satisfies CommandFile<false>;

async function handleReply(
	interaction: StringSelectMenuInteraction,
	message: Message,
	tickets: Ticket[],
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
	await useUserTicket(
		tickets.map((v) => v.ticketId),
		"Used via /useticket command",
	);
	const usages: TicketUsage[] = [];
	for (const ticket of tickets) {
		usages.push({
			ticket,
			usedAt: new Date(),
			success: ticketEffectManager.use(
				interaction.user.id,
				ticket.ticketId,
				ticket.effect,
				() => {
					interaction.user
						.send(
							`Your ticket **${ticket.name}** effect (${TicketEffectTypeNames[ticket.effect.effect]}: ${ticket.effect.value}) has passed.`,
						)
						.catch(() => null);
				},
			),
		});
	}
	await response.update({
		embeds: [createTicketsUsageEmbed(usages)],
	});

	return true;
}
