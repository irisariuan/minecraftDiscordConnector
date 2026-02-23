import {
	getRawUserTicket,
	getUserTickets,
	createTicketHistory,
	countTicketHistories,
	getAllRawActiveTickets,
	createRawUserTicket,
	deleteRawUserTicket,
	updateRawUserTicket,
	createRawUserTicketWithTicketType,
	getRawUserTicketByTicketId,
	getRawUserTickets,
	createBulkTicketHistories,
} from "./db";
import type {
	UserTicket as DbUserTicket,
	Ticket as DbTicketType,
} from "../generated/prisma/client";
import {
	type Message,
	type PartialUser,
	type SendableChannels,
	channelMention,
	ChannelType,
	ComponentType,
	GuildMember,
	MessageFlags,
	time,
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
import {
	calculateTimeDiffToNow,
	resolve,
	type Resolvable,
	type Time,
} from "./utils";
import { ticketEffectManager } from "./ticket/effect";
import { formatTicketNames } from "./utils/ticket";
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

export interface UserTicket extends Ticket {
	userId: string;
}

export interface TicketEffect {
	effect: TicketEffectType;
	value: number | null;
}
export enum TicketEffectType {
	Multiplier = "multiplier",
	FixedCredit = "fixed_credit",
	FreeUnderCost = "free_under_cost",
	FreePlay = "free_play",
	/**
	 * Can be used when starting an approval only
	 */
	CustomApprovalCount = "custom_approval_count",
	/**
	 * Can be used when voting an approval only
	 * Value: Max. approval count
	 */
	RepeatApprove = "repeat_approve",
}
export const TicketEffectTypeNames: Record<TicketEffectType, string> = {
	[TicketEffectType.Multiplier]: "Multiplier",
	[TicketEffectType.FixedCredit]: "Fixed Credit",
	[TicketEffectType.FreeUnderCost]: "Free Under Cost",
	[TicketEffectType.FreePlay]: "Free Play For Certain Hours",
	[TicketEffectType.CustomApprovalCount]: "Custom Approval Count",
	[TicketEffectType.RepeatApprove]: "Repeat Approval",
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
	if (
		userUsableTicketEffects.includes(ticket.effect.effect) &&
		ticketEffectManager.inUse(ticket.ticketId)
	)
		return false;
	return true;
}

export function calculatePaymentTicketEffects(
	tickets: TicketEffect[],
	originalCost: number,
): number {
	let cost = originalCost;
	for (const ticket of tickets.toSorted(
		(a, b) =>
			ticketEffectsCalculateOrder[b.effect] -
			ticketEffectsCalculateOrder[a.effect],
	)) {
		switch (ticket.effect) {
			case TicketEffectType.FixedCredit: {
				if (ticket.value === null)
					throw new Error("Fixed credit ticket must have a value");
				cost = Math.max(0, cost - ticket.value);
				break;
			}
			case TicketEffectType.Multiplier: {
				if (ticket.value === null)
					throw new Error("Multiplier ticket must have a value");
				cost = Math.max(0, Math.floor(cost * ticket.value));
				break;
			}
			case TicketEffectType.FreeUnderCost: {
				if (ticket.value === null)
					throw new Error("Free under cost ticket must have a value");
				if (cost <= ticket.value) return 0;
				break;
			}
		}
	}
	return cost;
}

export const basePaymentTicketEffects: TicketEffectType[] = [
	TicketEffectType.FixedCredit,
	TicketEffectType.Multiplier,
	TicketEffectType.FreeUnderCost,
];
export const regularPaymentTicketEffects = [
	TicketEffectType.CustomApprovalCount,
	...basePaymentTicketEffects,
];
export const voteApprovalTicketEffects = [
	TicketEffectType.RepeatApprove,
	...basePaymentTicketEffects,
];

/**
 * Bigger index means being calculated first
 */
export const ticketEffectsCalculateOrder: Record<TicketEffectType, number> = {
	// 0 are effects that don't affect the cost and can be calculated in any order after the cost-affecting effects
	[TicketEffectType.CustomApprovalCount]: 0,
	[TicketEffectType.FreePlay]: 0,
	[TicketEffectType.RepeatApprove]: 0,

	[TicketEffectType.FixedCredit]: 1,
	[TicketEffectType.Multiplier]: 2,
	[TicketEffectType.FreeUnderCost]: 3,
};

export const userUsableTicketEffects = [TicketEffectType.FreePlay];

export async function getUserTicketsByUserId({
	userId,
	ticketTypeIds,
	ticketEffectTypes,
	usableOnly = true,
}: {
	userId: string;
	ticketEffectTypes?: TicketEffectType[];
	ticketTypeIds?: string[];
	usableOnly?: boolean;
}): Promise<Ticket[] | null> {
	const rawTickets = await getUserTickets(
		userId,
		ticketTypeIds,
		ticketEffectTypes,
	);
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

export async function getAllTickets(): Promise<UserTicket[]> {
	const rawTickets = await getAllRawActiveTickets();
	return rawTickets.map((ticket) => ({
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
		userId: ticket.userId,
	}));
}
async function useSingleTicket(ticketId: string, reason?: string) {
	const ticket = await getRawUserTicket({ where: { id: ticketId } });
	if (!ticket || !(await isDbUserTicketAvailable(ticket))) return false;
	await createTicketHistory({
		data: { ticketId, action: TicketAction.Use, reason },
	});
	return true;
}

export async function useUserTicket(
	ticketIds: string | string[],
	reason?: string,
) {
	if (typeof ticketIds === "string")
		return await useSingleTicket(ticketIds, reason);
	const tickets = await getRawUserTickets({
		where: { id: { in: ticketIds } },
	});
	const availability = await Promise.all(
		tickets.map(async (ticket) => await isDbUserTicketAvailable(ticket)),
	);
	if (
		!tickets ||
		tickets.length === 0 ||
		!availability.every((available) => available)
	)
		return false;
	await createBulkTicketHistories(
		tickets.map(({ id }) => ({
			ticketId: id,
			action: TicketAction.Use,
			reason,
		})),
	);
	return true;
}

interface GetUserSelectedTicketMessageSetting {
	confirmationMessage: Resolvable<string, Ticket[]>;
	insideThread: boolean;
	maxSelect: number;
	minSelect: number;
	hideUseWithoutTicket: boolean;
}

interface GetUserSelectedTicketReturn<UseTicket extends boolean> {
	useTicket: UseTicket;
	tickets: UseTicket extends true ? Ticket[] : null;
	cancelled: UseTicket extends false ? boolean : false;
}

export async function getUserSelectTicketChannel(
	channel: SendableChannels,
	member: User | GuildMember,
): Promise<{
	channel: SendableChannels;
	createdChannel: boolean;
	cleanUp: (message: Message) => Promise<unknown>;
}> {
	const user = member instanceof GuildMember ? member.user : member;
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
			console.log("Cleaning up selection thread");
			await createdChannel.setLocked(true).catch(() => {});
			await message.edit({ components: [] }).catch(() => {});
			await createdChannel.send({
				content: `Please return to ${channelMention(channel.id)} for further interactions.`,
			});
			setTimeout(() => createdChannel.delete().catch(() => {}), 1000 * 5);
		},
	};
}

export async function getUserSelectedTickets(
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
				createTicketSelectMenu(
					tickets,
					indexPage,
					setting?.minSelect,
					setting?.maxSelect,
				),
				createTicketButtons(
					indexPage > 0,
					tickets.length > (indexPage + 1) * 25,
					setting?.hideUseWithoutTicket,
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
		new Promise<GetUserSelectedTicketReturn<boolean>>((r) => {
			selectCollector.on("collect", async (interaction) => {
				if (!interaction.values || interaction.values.length === 0) {
					await updateMessage();
					return await interaction.reply({
						content: "No ticket found!",
						flags,
					});
				}
				const ticketsFound = tickets.filter((v) =>
					interaction.values.includes(v.ticketId),
				);
				if (!ticketsFound) {
					await updateMessage();
					return await interaction.reply({
						content: "No ticket found!",
						flags,
					});
				}
				const confirmation = await interaction.reply({
					content: setting?.confirmationMessage
						? await resolve(
								setting.confirmationMessage,
								ticketsFound,
							)
						: `You have selected ${formatTicketNames(ticketsFound)}. Do you want to apply ${ticketsFound.length === 1 ? "this ticket" : "them"}?`,
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
					return r({
						cancelled: true,
						useTicket: false,
						tickets: null,
					});
				}
				if (requestStatus.customId !== RequestComponentId.Allow) {
					await updateMessage();
					const replied = await requestStatus.reply({
						content:
							"Ticket application cancelled. You can choose another ticket or not use any.",
						flags,
					});
					setTimeout(
						() => replied.delete().catch(() => {}),
						1000 * 5,
					);
					return;
				}
				await requestStatus.reply({
					content: `Ticket(s) ${formatTicketNames(ticketsFound)} applied.`,
					flags,
				});
				r({
					useTicket: true,
					tickets: ticketsFound,
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
						tickets: null,
					}) satisfies GetUserSelectedTicketReturn<false>,
			)
			.catch(
				() =>
					({
						useTicket: false,
						tickets: null,
						cancelled: true,
					}) satisfies GetUserSelectedTicketReturn<false>,
			)
			.finally(() => {
				selectCollector.stop();
				buttonCollector.stop();
			}),
	]);
}

function getExpiringStatus(time: Date) {
	const now = new Date();
	const diff = time.getTime() - now.getTime();
	if (diff <= 0) return "expired";
	if (diff <= 1000 * 60 * 60 * 24) return "expiring within 24 hours";
	if (diff <= 1000 * 60 * 60 * 24 * 3) return "expiring within 3 days";
	return "expiring soon";
}

const reminderTimeBefores: Time[] = [
	{
		hour: 24 * 3,
		minute: 0,
	},
	{
		hour: 24,
		minute: 0,
	},
];

class TicketNotificationManager {
	private timeouts: Map<string, NodeJS.Timeout[]> = new Map();

	private getExpiringStatus(time: Date) {
		return getExpiringStatus(time);
	}

	private async sendNotification(
		user: User | PartialUser | GuildMember,
		content: string,
		silent?: boolean,
	) {
		try {
			return await user.send({
				content,
				flags: silent ? MessageFlags.SuppressNotifications : [],
			});
		} catch {
			return null;
		}
	}

	private async sendNewNotification(
		user: User,
		ticket: Ticket,
		reason?: string,
		serverId?: number,
		silent?: boolean,
	) {
		const content = `You have received a new ticket **${ticket.name}**!${reason ? `\nReason: ${reason}` : ""}${serverId ? `\nServer ID: ${serverId}` : ""}`;
		return await this.sendNotification(user, content, silent);
	}

	private async sendExpiringNotification(
		user: User,
		ticket: Ticket,
		reason?: string,
		serverId?: number,
		silent?: boolean,
	) {
		if (!ticket.expiresAt) return null;
		const content = `Your ticket **${ticket.name}** is ${this.getExpiringStatus(ticket.expiresAt)} (at ${time(ticket.expiresAt)})!${reason ? `\nReason: ${reason}` : ""}${serverId ? `\nServer ID: ${serverId}` : ""}`;
		return await this.sendNotification(user, content, silent);
	}

	private async sendExpiredNotification(
		user: User,
		ticket: Ticket,
		reason?: string,
		serverId?: number,
		silent?: boolean,
	) {
		if (!ticket.expiresAt) return null;
		const content = `Your ticket **${ticket.name}** is ${this.getExpiringStatus(ticket.expiresAt)} (at ${time(ticket.expiresAt)})!${reason ? `\nReason: ${reason}` : ""}${serverId ? `\nServer ID: ${serverId}` : ""}`;
		return await this.sendNotification(user, content, silent);
	}

	private async sendDeletedNotification(
		user: User,
		ticketId: string,
		reason?: string,
		serverId?: number,
		silent?: boolean,
	) {
		const ticket = await getRawUserTicketByTicketId(ticketId);
		if (!ticket) {
			return null;
		}
		const content = `Your ticket **${ticket.ticket.name}** has been removed!${reason ? `\nReason: ${reason}` : ""}${serverId ? `\nServer ID: ${serverId}` : ""}`;
		return await this.sendNotification(user, content, silent);
	}

	async sendUsedNotification(
		user: User | PartialUser | GuildMember,
		ticket: Ticket,
		reason?: string,
		serverId?: number,
		silent?: boolean,
	) {
		const content = `You have used a ticket **${ticket.name}**!${reason ? `\nReason: ${reason}` : ""}${serverId ? `\nServer ID: ${serverId}` : ""}`;
		return await this.sendNotification(user, content, silent);
	}

	newTicket(user: User, ticket: Ticket, reason?: string) {
		this.sendNewNotification(user, ticket, reason);
		this.addTicket(user, ticket);
	}

	addTicket(user: User, ticket: Ticket) {
		if (!ticket.expiresAt) return;
		const timeouts = [];
		for (const reminderTimeBefore of reminderTimeBefores) {
			const reminderTime = calculateTimeDiffToNow(
				ticket.expiresAt,
				reminderTimeBefore,
			);
			if (!reminderTime) continue;

			timeouts.push(
				setTimeout(() => {
					if (!ticket.expiresAt) return;
					const reason = `Ticket expiring soon (${this.getExpiringStatus(ticket.expiresAt)})`;
					this.sendExpiringNotification(user, ticket, reason);
				}, reminderTime),
			);
		}
		// also create a timeout for the expiration notification
		const expireTime = calculateTimeDiffToNow(ticket.expiresAt);
		if (expireTime) {
			timeouts.push(
				setTimeout(() => {
					if (!ticket.expiresAt) return;
					this.sendExpiredNotification(
						user,
						ticket,
						"Ticket expired",
					);
				}, expireTime),
			);
		}
		this.timeouts.set(ticket.ticketId, timeouts);
	}

	updateTicket(user: User, ticket: Ticket, reason?: string) {
		this.deleteTicketTimeouts(ticket.ticketId);
		this.newTicket(user, ticket, reason);
	}

	private deleteTicketTimeouts(ticketId: string) {
		const timeouts = this.timeouts.get(ticketId);
		if (timeouts) {
			for (const timeout of timeouts) {
				clearTimeout(timeout);
			}
			this.timeouts.delete(ticketId);
		}
	}

	deleteTicket(user: User, ticketId: string, reason?: string) {
		this.sendDeletedNotification(
			user,
			ticketId,
			reason ?? "Ticket removed",
		);
		this.deleteTicketTimeouts(ticketId);
	}
}

export const ticketNotificationManager = new TicketNotificationManager();

interface AddTicketToUserParams {
	user: User;
	quantity: number;
	ticketTypeId: string;
	maxUse?: number | null;
	expiresAt?: Date | null;
	reason?: string | null;
	silent?: boolean;
}

export async function addTicketToUser({
	user,
	quantity,
	ticketTypeId,
	maxUse,
	expiresAt,
	reason,
	silent,
}: AddTicketToUserParams) {
	for (let i = 0; i < quantity; i++) {
		const rawTicket = await createRawUserTicketWithTicketType({
			data: {
				userId: user.id,
				ticketId: ticketTypeId,
				maxUse,
				expiresAt,
				reason,
			},
			include: {
				ticket: true,
			},
		});
		if (!silent)
			ticketNotificationManager.newTicket(
				user,
				{
					ticketId: rawTicket.id,
					ticketTypeId,
					name: rawTicket.ticket.name,
					description: rawTicket.ticket.description,
					effect: {
						effect: rawTicket.ticket.effect as TicketEffectType,
						value: rawTicket.ticket.value,
					},
					maxUse: rawTicket.maxUse ?? null,
					expiresAt: rawTicket.expiresAt,
					reason: rawTicket.reason,
				},
				reason ?? undefined,
			);
	}
}

interface RemoveTicketFromUserParams {
	ticketId: string;
	user: User;
	silent?: boolean;
}

export async function removeTicketFromUser({
	ticketId,
	user,
	silent,
}: RemoveTicketFromUserParams): Promise<boolean> {
	const ticket = await getRawUserTicket({
		where: { id: ticketId, userId: user.id },
	});

	if (!ticket) {
		return false;
	}
	try {
		await deleteRawUserTicket({
			where: { id: ticketId },
		});
		if (silent) return true;
		ticketNotificationManager.deleteTicket(user, ticketId);
		return true;
	} catch (error) {
		console.error("Error deleting ticket:", error);
		return false;
	}
}

interface UpdateUserTicketParams {
	ticketId: string;
	maxUse?: number | null;
	expiresAt?: Date | null;
	reason?: string | null;
	user: User | null;
	silent?: boolean;
}

export async function updateUserTicket({
	ticketId,
	maxUse,
	expiresAt,
	reason,
	user,
	silent,
}: UpdateUserTicketParams): Promise<boolean> {
	// Check if ticket exists
	const existingTicket = await getRawUserTicket({
		where: { id: ticketId },
	});

	if (!existingTicket) {
		return false;
	}

	// Prepare update data
	const updateData: any = {};
	if (maxUse !== undefined && maxUse !== null) {
		updateData.maxUse = maxUse;
	}
	if (expiresAt !== undefined) {
		updateData.expiresAt = expiresAt;
	}
	if (reason !== undefined) {
		updateData.reason = reason;
	}

	// Check if there's anything to update
	if (Object.keys(updateData).length === 0) {
		return false;
	}

	try {
		const rawTicket = await updateRawUserTicket({
			where: { id: ticketId },
			data: updateData,
		});
		if (user && !silent)
			ticketNotificationManager.updateTicket(user, {
				ticketId: rawTicket.id,
				ticketTypeId: rawTicket.ticketId,
				name: rawTicket.ticket.name,
				description: rawTicket.ticket.description,
				effect: {
					effect: rawTicket.ticket.effect as TicketEffectType,
					value: rawTicket.ticket.value,
				},
				maxUse: rawTicket.maxUse ?? null,
				expiresAt: rawTicket.expiresAt,
				reason: rawTicket.reason,
				histories: rawTicket.history.map((h) => ({
					action: h.action,
					reason: h.reason,
					ticketId: h.ticketId,
					timestamp: h.timestamp,
					ticketHistoryId: h.id,
				})),
			});
		return true;
	} catch (error) {
		console.error("Error updating ticket:", error);
		return false;
	}
}
