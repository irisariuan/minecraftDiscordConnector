import { EmbedBuilder, time } from "discord.js";
import {
	TicketEffectType,
	TicketEffectTypeNames,
	type DbTicketType,
	type Ticket,
} from "../ticket";
import type { TicketUsage } from "../utils/ticket";
import { calculateEffectDuration } from "../ticket/effect";

export function createTicketEmbed(
	ticket: Ticket,
	requestedUsername: string,
	username: string,
) {
	const useCount = ticket.histories?.length ?? 0;
	const exceedMaxUseCount =
		ticket.maxUse !== null && ticket.maxUse > 0
			? useCount >= ticket.maxUse
			: false;
	const maxUseText =
		ticket.maxUse !== null && ticket.maxUse > 0
			? ` ${useCount}/${ticket.maxUse} uses`
			: ` Used ${useCount} times (Unlimited uses)`;
	let isExpired = false;
	let expireText = "No expiration date";
	if (ticket.expiresAt) {
		const expireDate = new Date(ticket.expiresAt);
		const now = new Date();
		isExpired = expireDate <= now;
		expireText = isExpired
			? `**Expired** at ${time(expireDate)}`
			: `Expires at ${time(expireDate)}`;
	}
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
				name: "Reason",
				value: ticket.reason || "No reason provided",
				inline: false,
			},
			{
				name: "Expiration",
				value: expireText,
				inline: true,
			},
			{
				name: "Usage",
				value: maxUseText,
				inline: true,
			},
			{
				name: "Histories",
				value:
					ticket.histories && ticket.histories.length > 0
						? ticket.histories
								.map(
									(h, i) =>
										`${i + 1}. ${time(
											new Date(h.timestamp),
										)} Action: \`${h.action}\`${
											h.reason
												? `, Reason: ${h.reason}`
												: ""
										}`,
								)
								.join("\n")
						: "No history available",
				inline: false,
			},
			{
				name: "Availability",
				value: exceedMaxUseCount
					? "*Unavailable* (Exceeded max use)"
					: isExpired
						? "*Unavailable* (Expired)"
						: "**Available**",
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

export function createTicketsUsageEmbed(tickets: TicketUsage[]) {
	return new EmbedBuilder()
		.setTitle("Active Ticket Usages")
		.setColor("Purple")
		.addFields(
			tickets.length > 0
				? tickets.map((t) => {
						const duration = calculateEffectDuration(
							t.ticket.effect,
						);
						return {
							name: `Ticket ID: ${t.ticket.ticketId}`,
							value: `Effect: ${
								TicketEffectTypeNames[t.ticket.effect.effect] ??
								"Unknown effect"
							} (${t.ticket.effect.value})\nStarted at: ${time(
								t.usedAt,
							)}\nExpires at: ${
								t.ticket.expiresAt
									? duration !== null
										? time(
												new Date(
													t.usedAt.getTime() +
														duration,
												),
											)
										: "Unknown duration"
									: "No expiration"
							}`,
						};
					})
				: [
						{
							name: "No active ticket usages",
							value: "There are currently no active ticket usages.",
						},
					],
		);
}
