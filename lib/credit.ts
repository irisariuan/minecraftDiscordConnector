import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	italic,
	MessageFlags,
	time,
	userMention,
	type GuildMember,
	type Interaction,
	type PartialUser,
	type User,
} from "discord.js";
import { getUserById, newTransaction, setUserCredits } from "./db";
import {
	comparePermission,
	PermissionFlags,
	readPermission,
} from "./permission";
import {
	calculatePaymentTicketEffect,
	getUserSelectedTicket,
	getUserSelectTicketChannel,
	getUserTicketsByUserId,
	paymentTicketEffects,
	TicketEffectType,
	useUserTicket,
	type Ticket,
} from "./ticket";

export interface UserCredit {
	userId: string;
	currentCredit: number;
	histories: Transaction[];
}

export interface Transaction {
	userId: string;
	creditAfter: number;
	creditBefore: number;
	changed: number;
	originalAmount: number;
	ticketUsed: Ticket | null;
	timestamp: number;
	reason?: string;
	trackingId: string;
	serverTag: string | null;
	historyId: string | null;
}
export type PartialTransaction = Omit<Transaction, "trackingId" | "historyId">;

export async function setCredit({
	userId,
	credit,
	serverId,
	reason,
}: {
	userId: string;
	credit: number;
	serverId?: number;
	reason: string;
}) {
	const userCreditFetched = await getCredit(userId);
	if (!userCreditFetched) return null;
	await newTransaction({
		user: {
			connectOrCreate: { create: { id: userId }, where: { id: userId } },
		},
		afterAmount: credit,
		beforeAmount: userCreditFetched.currentCredit,
		amount: credit - userCreditFetched.currentCredit,
		reason,
		server: {
			connect: serverId
				? {
						id: serverId,
					}
				: undefined,
		},
		timestamp: new Date(),
	});
	await setUserCredits(userId, credit);
	return userCreditFetched.currentCredit;
}

export async function changeCredit({
	userId,
	change,
	serverId,
	reason,
	ticketId,
}: {
	userId: string;
	change: number;
	serverId?: number;
	reason: string;
	ticketId?: string;
}) {
	const userCreditFetched = await getCredit(userId);
	if (!userCreditFetched) return null;

	await newTransaction({
		user: {
			connectOrCreate: { create: { id: userId }, where: { id: userId } },
		},
		server: {
			connect: serverId
				? {
						id: serverId,
					}
				: undefined,
		},
		afterAmount: userCreditFetched.currentCredit + change,
		beforeAmount: userCreditFetched.currentCredit,
		amount: change,
		ticket: {
			connect: ticketId
				? {
						id: ticketId,
					}
				: undefined,
		},
		reason,
		timestamp: new Date(),
	});
	await setUserCredits(userId, userCreditFetched.currentCredit + change);

	return userCreditFetched.currentCredit + change;
}

export async function getCredit(userId: string): Promise<UserCredit | null> {
	const user = await getUserById(userId);
	if (!user) {
		if (
			!comparePermission(
				await readPermission(userId),
				PermissionFlags.use,
			)
		)
			return null;
		return {
			userId,
			currentCredit: 0,
			histories: [],
		};
	}
	return {
		userId: userId,
		currentCredit: user.credits,
		histories: user.transactions
			.map(
				(v): Transaction => ({
					userId: userId,
					changed: v.finalAmount ?? v.amount,
					originalAmount: v.amount,
					creditAfter: v.afterAmount,
					creditBefore: v.beforeAmount,
					timestamp: v.timestamp.getTime(),
					reason: v.reason || undefined,
					trackingId: v.id.toString(),
					serverTag: v.server?.tag ?? null,
					ticketUsed: v.ticket
						? {
								ticketId: v.ticket.id,
								maxUse: v.ticket.maxUse ?? null,
								name: v.ticket.ticket.name,
								description: v.ticket.ticket.description,
								reason: v.ticket.reason,
								ticketTypeId: v.ticket.ticket.id,
								effect: {
									effect: v.ticket.ticket
										.effect as TicketEffectType,
									value: v.ticket.ticket.value,
								},
							}
						: null,
					historyId: v.relatedTicketHistoryId,
				}),
			)
			.toSorted((a, b) => b.timestamp - a.timestamp),
	};
}

export async function canSpendCredit(userId: string, cost: number) {
	const credit = await getCredit(userId);
	if (!credit) return false;
	const permission = await readPermission(userId);
	return (
		credit.currentCredit >= cost ||
		comparePermission(permission, PermissionFlags.creditFree)
	);
}

export async function spendCreditWithoutTicket(
	user: User | PartialUser | GuildMember,
	userCredit: UserCredit,
	{ userId, cost, reason, serverId }: SpendCreditParams,
): Promise<PartialTransaction | null> {
	if (!(await canSpendCredit(userId, cost))) {
		return null;
	}
	await changeCredit({
		userId,
		change: -cost,
		reason,
		serverId,
	});
	await sendCreditNotification({
		user,
		creditChanged: -cost,
		reason,
		serverId,
	});
	return {
		userId,
		changed: -cost,
		originalAmount: -cost,
		creditBefore: userCredit.currentCredit,
		creditAfter: userCredit.currentCredit - cost,
		timestamp: Date.now(),
		reason,
		serverTag: null,
		ticketUsed: null,
	};
}
export interface SpendCreditParams {
	userId: string;
	cost: number;
	serverId?: number;
	reason: string;
	/**
	 * Empty array represent not allowing tickets
	 * Undefined represent allowing all tickets
	 */
	acceptedTicketTypeIds?: string[];
}

export async function spendCredit(
	interaction: Interaction,
	params: SpendCreditParams,
): Promise<PartialTransaction | null> {
	const { cost, reason, userId, serverId } = params;
	const tickets = await getUserTicketsByUserId({
		userId,
		ticketTypeIds: params.acceptedTicketTypeIds,
		ticketEffectTypes: paymentTicketEffects,
	});
	const credit = await getCredit(userId);
	if (!credit) return null;
	if (
		!tickets ||
		params.acceptedTicketTypeIds?.length === 0 ||
		tickets.length === 0 ||
		!interaction.channel?.isSendable()
	) {
		return spendCreditWithoutTicket(interaction.user, credit, params);
	}
	const { channel, cleanUp, createdChannel } =
		await getUserSelectTicketChannel(interaction.channel, interaction.user);
	const message = await channel.send({
		content: `${createdChannel ? "" : `${userMention(interaction.user.id)}\n`}You need to pay \`${cost}\` credits for this action. You have \`${credit.currentCredit}\` credits.\nYou can also use a ticket to reduce the cost.`,
	});
	const {
		cancelled,
		ticket: selectedTicket,
		useTicket,
	} = await getUserSelectedTicket(message, userId, tickets, {
		confirmationMessage: (ticket) => {
			const finalCost = calculatePaymentTicketEffect(ticket.effect, cost);
			return `After using this ticket, you will have to pay \`${finalCost}\` credits`;
		},
		insideThread: createdChannel,
	});
	await cleanUp(message);

	if (cancelled) {
		console.error("No ticket selected, cancelling payment.");
		return null;
	}
	if (selectedTicket && useTicket) {
		const finalCost = calculatePaymentTicketEffect(
			selectedTicket.effect,
			cost,
		);
		if (!(await canSpendCredit(userId, finalCost))) {
			return null;
		}
		if (await useUserTicket(selectedTicket.ticketId, reason)) {
			const reasonString = `${reason} (Using Ticket: ${selectedTicket.name}, saved ${cost - finalCost} credits)`;
			await changeCredit({
				userId,
				change: -finalCost,
				reason: reasonString,
				serverId,
				ticketId: selectedTicket.ticketId,
			});
			await sendCreditNotification({
				user: interaction.user,
				creditChanged: -finalCost,
				reason: reasonString,
				serverId,
			});
			return {
				userId,
				changed: -finalCost,
				originalAmount: -cost,
				creditBefore: credit.currentCredit,
				creditAfter: credit.currentCredit - finalCost,
				timestamp: Date.now(),
				reason: reasonString,
				serverTag: null,
				ticketUsed: selectedTicket,
			};
		}
		await message.edit({
			content: "Failed to use the selected ticket. Paying full price.",
		});
	}
	if (!(await canSpendCredit(userId, cost))) return null;
	await changeCredit({
		userId,
		change: -cost,
		reason,
		serverId,
	});
	await sendCreditNotification({
		user: interaction.user,
		creditChanged: -cost,
		reason,
		serverId,
	});
	return {
		userId,
		changed: -cost,
		originalAmount: -cost,
		creditBefore: credit.currentCredit,
		creditAfter: credit.currentCredit - cost,
		timestamp: Date.now(),
		reason,
		serverTag: null,
		ticketUsed: null,
	};
}

interface SendCreditNotificationParams {
	user: User | PartialUser | GuildMember;
	creditChanged: number;
	reason: string;
	serverId?: number;
	silent?: boolean;
	cancellable?: boolean;
	maxRefund?: number;
	onRefund?: (refundAmount: number) => unknown;
}

export async function sendCreditNotification({
	user,
	creditChanged,
	reason,
	serverId,
	silent = false,
	cancellable = false,
	maxRefund = 0,
	onRefund,
}: SendCreditNotificationParams): Promise<boolean> {
	const creditFetched = await getCredit(user.id);
	if (!creditFetched) return false;
	const expire = new Date(Date.now() + 1000 * 60 * 10); // 10 minutes
	const isNegative = creditChanged < 0;
	const refund =
		maxRefund > 0
			? Math.min(Math.abs(creditChanged), maxRefund) *
				(isNegative ? 1 : -1)
			: -creditChanged;
	const message = await user
		.send({
			content: `Your credit has been changed by \`${creditChanged}\`. Your current credit is \`${creditFetched.currentCredit}\`\nReason: ${italic(
				reason,
			)}${
				cancellable
					? `\n*You can cancel this transaction (refunding ${refund} credits to sender) by clicking the button below before ${time(new Date(expire))}.*`
					: ""
			}`,
			flags: silent ? [MessageFlags.SuppressNotifications] : [],
			components: cancellable
				? [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							createCancelButton(),
						),
					]
				: [],
		})
		.catch((err) => console.error("Error occured during DM", err));
	if (cancellable && message) {
		setTimeout(
			async () => {
				message.edit({ components: [] });
			},
			1000 * 60 * 10,
		);
		const collector = message.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 1000 * 60 * 10,
			filter: (i) => i.user.id === user.id,
			max: 1,
		});
		collector.on("collect", async () => {
			onRefund?.(refund);
			const newCredit = await changeCredit({
				userId: user.id,
				change: refund,
				serverId,
				reason: `Cancelled: ${reason}`,
			});
			console.log(
				`User ${user.id} cancelled a transaction of ${creditChanged}, refunded ${-refund}, new credit: ${newCredit}`,
			);
			await message.edit({
				content: `The transaction has been cancelled. Your credit has been changed by \`${refund}\`. Your current credit is \`${newCredit}\``,
				components: [],
			});
		});
	}
	return true;
}

export enum CreditNotificationButtonId {
	CancelButton = "CANCEL_TRANSACTION",
	ApproveButton = "APPROVE_TRANSACTION",
}

export function createCancelButton() {
	return new ButtonBuilder()
		.setCustomId(CreditNotificationButtonId.CancelButton)
		.setLabel("Cancel Transaction")
		.setStyle(ButtonStyle.Danger);
}

export function createApproveButton() {
	return new ButtonBuilder()
		.setCustomId(CreditNotificationButtonId.ApproveButton)
		.setLabel("Approve Transaction")
		.setStyle(ButtonStyle.Success);
}
