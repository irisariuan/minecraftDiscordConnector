import {
	getRawUserTicket,
	getUserTickets,
	createTicketHistory,
	countTicketHistories,
} from "./db";
import type {
	UserTicket as DbUserTicket,
	Ticket as DbTicketType,
} from "../generated/prisma/client";
import {
	type Message,
	type SendableChannels,
	channelMention,
	ChannelType,
	ComponentType,
	MessageFlags,
	User,
	userMention,
} from "discord.js";
import {
	createTicketSelectMenu,
	createTicketButtons,
	TicketSelectMenu,
} from "./component/credit";
import {
	createRequestComponent,
	RequestComponentId,
} from "./component/request";
export { type DbUserTicket, type DbTicketType };
export enum TicketAction {
	Use = "use",
}

export interface Ticket {
	ticketId: string;
	ticketTypeId: string;
	name: string;
	description: string | null;
	effect: TicketEffect;
	reason: string | null;
	maxUse: number | null;
	expiresAt?: Date | null;
	histories?: TicketHistory[];
}

export interface TicketEffect {
	effect: TicketEffectType;
	value: number;
}
export enum TicketEffectType {
	Multiplier = "multiplier",
	FixedCredit = "fixed_credit",
	FreeUnderCost = "free_under_cost",
}
export const TicketEffectTypeNames: Record<TicketEffectType, string> = {
	[TicketEffectType.Multiplier]: "Multiplier",
	[TicketEffectType.FixedCredit]: "Fixed Credit",
	[TicketEffectType.FreeUnderCost]: "Free Under Cost",
};

export interface TicketHistory {
	ticketId: string;
	action: string;
	reason: string | null;
	timestamp: Date;
	ticketHistoryId: string;
}

export async function isDbUserTicketAvailable(
	ticket: DbUserTicket,
): Promise<boolean> {
	if (
		ticket.maxUse !== null &&
		ticket.maxUse > 0 &&
		(await countTicketHistories(ticket.id)) >= ticket.maxUse
	) {
		return false;
	}
	if (ticket.expiresAt !== null && ticket.expiresAt <= new Date()) {
		return false;
	}
	return true;
}
export function isTicketAvailable(ticket: Ticket) {
	if (ticket.expiresAt) {
		const expireDate = new Date(ticket.expiresAt);
		const now = new Date();
		if (expireDate <= now) return false;
	}
	if (ticket.maxUse !== null && ticket.maxUse > 0) {
		return (ticket.histories?.length ?? 0) < ticket.maxUse;
	}
	return true;
}

export function calculateTicketEffect(
	ticket: TicketEffect,
	originalCost: number,
): number {
	switch (ticket.effect) {
		case TicketEffectType.FixedCredit:
			return Math.max(0, originalCost - ticket.value);
		case TicketEffectType.Multiplier:
			return Math.max(0, Math.floor(originalCost * ticket.value));
		case TicketEffectType.FreeUnderCost:
			if (originalCost <= ticket.value) return 0;
			return originalCost;
		default: {
			console.error("Unknown ticket effect type:", ticket.effect);
			return originalCost;
		}
	}
}

export async function getUserTicketsByUserId(
	userId: string,
	ticketTypeIds?: string[],
	usableOnly = true,
): Promise<Ticket[] | null> {
	const rawTickets = await getUserTickets(userId, ticketTypeIds);
	if (rawTickets.length <= 0) return null;
	const tickets: Ticket[] = [];
	for (const ticket of rawTickets) {
		const t: Ticket = {
			ticketId: ticket.id,
			maxUse: ticket.maxUse ?? null,
			name: ticket.ticket.name,
			description: ticket.ticket.description,
			reason: ticket.reason,
			ticketTypeId: ticket.ticket.id,
			expiresAt: ticket.expiresAt,
			effect: {
				effect: ticket.ticket.effect as TicketEffectType,
				value: ticket.ticket.value,
			},
			histories: ticket.history.map((h) => ({
				action: h.action,
				reason: h.reason,
				ticketId: h.ticketId,
				timestamp: h.timestamp,
				ticketHistoryId: h.id,
			})),
		};
		if (usableOnly && (await isDbUserTicketAvailable(ticket))) {
			tickets.push(t);
		} else if (!usableOnly) {
			tickets.push(t);
		}
	}
	return tickets;
}

export async function useUserTicket(ticketId: string, reason?: string) {
	const ticket = await getRawUserTicket({
		where: { id: ticketId },
	});
	if (!ticket || !(await isDbUserTicketAvailable(ticket))) return false;
	await createTicketHistory({
		data: { ticketId, action: TicketAction.Use, reason },
	});
	return true;
}

interface GetUserSelectedTicketMessageSetting {
	confirmationMessage: (ticket: Ticket) => Promise<string> | string;
	insideThread: boolean;
}

interface GetUserSelectedTicketReturn<UseTicket extends boolean> {
	useTicket: UseTicket;
	ticket: UseTicket extends true ? Ticket : null;
	cancelled: UseTicket extends false ? boolean : false;
}

export async function getUserSelectTicketChannel(
	channel: SendableChannels,
	user: User,
): Promise<{
	channel: SendableChannels;
	createdChannel: boolean;
	cleanUp: (message: Message) => Promise<unknown>;
}> {
	if (
		!("threads" in channel) ||
		channel.type === ChannelType.GuildAnnouncement
	)
		return {
			channel,
			createdChannel: false,
			cleanUp: async (message) => await message.delete().catch(() => {}),
		};
	const createdChannel = await channel.threads
		.create({
			name: `Ticket Selection - ${user.username}`,
			reason: "User ticket selection",
			type: ChannelType.PrivateThread,
			invitable: false,
		})
		.catch(() => null);
	if (!createdChannel) {
		return {
			channel,
			createdChannel: false,
			cleanUp: async (message) => await message.delete().catch(() => {}),
		};
	}
	await createdChannel.members.add(user);
	const selectTicketMessage = await channel.send({
		content: `${userMention(user.id)}, please select your ticket in ${channelMention(createdChannel.id)}.`,
	});
	setTimeout(() => {
		if (selectTicketMessage.deletable)
			selectTicketMessage.delete().catch(() => {});
	}, 1000 * 5);
	return {
		channel: createdChannel,
		createdChannel: true,
		cleanUp: async (message) => {
			await createdChannel.setLocked(true).catch(() => {});
			await message.edit({ components: [] }).catch(() => {});
			await createdChannel.send({
				content: `Please return to ${channelMention(channel.id)} for further interactions.`,
			});
			setTimeout(() => createdChannel.delete().catch(() => {}), 1000 * 5);
		},
	};
}

export async function getUserSelectedTicket(
	message: Message,
	userId: string,
	tickets: Ticket[],
	setting?: Partial<GetUserSelectedTicketMessageSetting>,
): Promise<GetUserSelectedTicketReturn<boolean>> {
	const time = 1000 * 60 * 2;
	const indexPage = 0;
	const flags = setting?.insideThread ? undefined : MessageFlags.Ephemeral;
	const updateMessage = async () =>
		await message.edit({
			components: [
				createTicketSelectMenu(tickets, indexPage),
				createTicketButtons(
					indexPage > 0,
					tickets.length > (indexPage + 1) * 25,
				),
			],
		});
	await updateMessage();

	const buttonCollector = message.createMessageComponentCollector({
		componentType: ComponentType.Button,
		time,
		filter: (i) =>
			i.user.id === userId &&
			(i.customId === TicketSelectMenu.TICKET_SELECT_NEXT_ID ||
				i.customId === TicketSelectMenu.TICKET_SELECT_PREV_ID),
	});
	const selectCollector = message.createMessageComponentCollector({
		componentType: ComponentType.StringSelect,
		time,
		filter: (i) => i.user.id === userId,
	});

	buttonCollector.on("collect", async (interaction) => {
		await interaction.deferUpdate();
		let newPage = indexPage;
		if (interaction.customId === TicketSelectMenu.TICKET_SELECT_NEXT_ID) {
			newPage += 1;
		} else if (
			interaction.customId === TicketSelectMenu.TICKET_SELECT_PREV_ID
		) {
			newPage = Math.max(0, newPage - 1);
		}
		// Update the select menu and buttons
		await message.edit({
			components: [
				createTicketSelectMenu(tickets, newPage),
				createTicketButtons(
					newPage > 0,
					tickets.length > (newPage + 1) * 25,
				),
			],
		});
	});
	return Promise.race([
		new Promise<GetUserSelectedTicketReturn<boolean>>((resolve) => {
			selectCollector.on("collect", async (interaction) => {
				const value = interaction.values[0];
				if (!value) {
					await updateMessage();
					return await interaction.reply({
						content: "No ticket found!",
						flags,
					});
				}
				const ticketFound = tickets.find((v) => v.ticketId === value);
				if (!ticketFound) {
					await updateMessage();
					return await interaction.reply({
						content: "No ticket found!",
						flags,
					});
				}
				const confirmation = await interaction.reply({
					content:
						(await setting?.confirmationMessage?.(ticketFound)) ??
						`You have selected the ticket \`${ticketFound.name}\`. Do you want to apply this ticket?`,
					withResponse: true,
					components: [
						createRequestComponent({
							showAllow: true,
							showCancel: true,
							showDeny: false,
						}),
					],
				});
				if (!confirmation.resource?.message)
					throw new Error("No message returned");
				const finalMessage = confirmation.resource.message;
				const requestStatus = await finalMessage
					.awaitMessageComponent({
						componentType: ComponentType.Button,
						time,
						filter: (i) => i.user.id === userId,
					})
					.catch(() => null);
				if (finalMessage.deletable)
					await finalMessage.delete().catch(() => {});
				if (!requestStatus) {
					await interaction.followUp({
						content: "Request timed out.",
						flags,
					});
					return resolve({
						cancelled: true,
						useTicket: false,
						ticket: null,
					});
				}
				if (requestStatus.customId !== RequestComponentId.Allow) {
					await updateMessage();
					await requestStatus.reply({
						content:
							"Ticket application cancelled. You can choose another ticket or not use any.",
						flags,
					});
					return;
				}
				await requestStatus.reply({
					content: `Ticket \`${ticketFound.name}\` applied.`,
					flags,
				});
				resolve({
					useTicket: true,
					ticket: ticketFound,
					cancelled: false,
				});
				buttonCollector.stop();
				selectCollector.stop();
			});
		}),
		message
			.awaitMessageComponent({
				componentType: ComponentType.Button,
				filter: (i) =>
					i.user.id === userId &&
					(i.customId === TicketSelectMenu.TICKET_NO_USE_ID ||
						i.customId === TicketSelectMenu.TICKET_CANCEL_ID),
				time,
			})
			.then(
				(interaction) =>
					({
						cancelled:
							interaction.customId ===
							TicketSelectMenu.TICKET_CANCEL_ID,
						useTicket: false,
						ticket: null,
					}) satisfies GetUserSelectedTicketReturn<false>,
			)
			.catch(
				() =>
					({
						useTicket: false,
						ticket: null,
						cancelled: true,
					}) satisfies GetUserSelectedTicketReturn<false>,
			)
			.finally(() => {
				selectCollector.stop();
				buttonCollector.stop();
			}),
	]);
}
