import { EmbedBuilder, time } from "discord.js";
import {
	TicketEffectType,
	TicketEffectTypeNames,
	type DbTicketType,
	type Ticket,
} from "../ticket";

export function createTicketEmbed(
	ticket: Ticket,
	requestedUsername: string,
	username: string,
) {
	return new EmbedBuilder()
		.setTitle(`${ticket.name} (${ticket.ticketTypeId})`)
		.setColor("Blue")
		.addFields(
			{
				name: "Ticket ID",
				value: ticket.ticketId,
				inline: true,
			},
			{
				name: "Effect",
				value: `${TicketEffectTypeNames[ticket.effect.effect] ?? "Unknown effect"} (${ticket.effect.value})`,
				inline: true,
			},
			{
				name: "Description",
				value: ticket.description || "No description",
				inline: false,
			},
			{
				name: "Expiration",
				value: ticket.expiresAt
					? `Expires at ${time(new Date(ticket.expiresAt))}`
					: "No expiration date",
				inline: true,
			},
			{
				name: "Usage",
				value: (() => {
					const useCount = ticket.histories?.length ?? 0;
					const maxUseText =
						ticket.maxUse !== null && ticket.maxUse > 0
							? ` (${useCount}/${ticket.maxUse} uses)`
							: ` (Used ${useCount} times)`;
					return `${maxUseText}`;
				})(),
				inline: true,
			},
		)
		.setFooter({
			text: `User: ${username} | Requested by: ${requestedUsername}`,
		});
}
export function createTicketUpdateEmbed(
	title: string,
	ticketId: string,
	updates: string[],
) {
	return new EmbedBuilder()
		.setTitle(title)
		.setColor("Orange")
		.addFields(
			{
				name: "ID",
				value: ticketId,
				inline: true,
			},
			{
				name: "Updates",
				value: updates.join("\n"),
				inline: false,
			},
		);
}
export function createTicketTypeUpdateEmbed(ticketType: DbTicketType) {
	const embed = new EmbedBuilder()
		.setTitle("Ticket Type Created")
		.setColor("Green")
		.addFields(
			{
				name: "ID",
				value: ticketType.id,
				inline: true,
			},
			{
				name: "Name",
				value: ticketType.name,
				inline: true,
			},
			{
				name: "Effect",
				value: `${TicketEffectTypeNames[ticketType.effect as TicketEffectType] ?? "Unknown effect"} (${ticketType.value})`,
				inline: true,
			},
		);
	if (ticketType.description)
		embed.addFields({
			name: "Description",
			value: ticketType.description,
		});
	return embed;
}
