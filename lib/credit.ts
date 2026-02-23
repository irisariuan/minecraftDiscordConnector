import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	italic,
	MessageFlags,
	time,
	userMention,
	type Channel,
	type GuildMember,
	type Interaction,
	type PartialUser,
	type User,
} from "discord.js";
import { getUserById, newTransaction, setUserCredits } from "./db";
import {
	orPerm,
	comparePermission,
	PermissionFlags,
	readPermission,
} from "./permission";
import {
	calculatePaymentTicketEffects,
	getUserSelectedTickets,
	getUserSelectTicketChannel,
	getUserTicketsByUserId,
	paymentTicketEffects,
	TicketEffectType,
	useUserTicket,
	type Ticket,
} from "./ticket";
import { formatTicketNames } from "./utils/ticket";
import { resolve, type Resolvable } from "./utils";

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
	ticketUsed: Ticket[] | null;
	timestamp: number;
	reason?: string;
	trackingId: string;
	serverTag: string | null;
	historyId: string[] | null;
}
export type PartialTransaction = Omit<
	Transaction,
	"trackingId" | "historyId" | "serverTag"
>;

export interface SetCreditParams {
	userId: string;
	credit: number;
	serverId?: number;
	reason: string;
}

export async function setCredit({
	userId,
	credit,
	serverId,
	reason,
}: SetCreditParams) {
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

export interface ChangeCreditParams {
	userId: string;
	change: number;
	serverId?: number;
	reason: string;
	ticketId?: string[];
}

export async function changeCredit({
	userId,
	change,
	serverId,
	reason,
	ticketId,
}: ChangeCreditParams) {
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
			connect: ticketId?.map((id) => ({ id })),
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
					ticketUsed:
						v.ticket.map((t) => ({
							ticketId: t.id,
							maxUse: t.maxUse ?? null,
							name: t.ticket.name,
							description: t.ticket.description,
							reason: t.reason,
							ticketTypeId: t.ticket.id,
							effect: {
								effect: t.ticket.effect as TicketEffectType,
								value: t.ticket.value,
							},
						})) ?? null,
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
		comparePermission(
			permission,
			orPerm(PermissionFlags.noCreditCheck, PermissionFlags.skipPayment),
		)
	);
}

/**
 * Helper function to spend credit without ticket selection, should not be called outside.
 *
 * Provide a empty acceptedTicketTypeIds to spendCredit instead
 */
async function spendCreditWithoutTicket(
	user: User | PartialUser | GuildMember,
	userCredit: UserCredit,
	{ cost, reason, serverId }: Omit<SpendCreditParams, "user">,
): Promise<PartialTransaction | null> {
	if (!(await canSpendCredit(user.id, cost))) {
		return null;
	}
	await changeCredit({
		userId: user.id,
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
		userId: user.id,
		changed: -cost,
		originalAmount: -cost,
		creditBefore: userCredit.currentCredit,
		creditAfter: userCredit.currentCredit - cost,
		timestamp: Date.now(),
		reason,
		ticketUsed: null,
	};
}
export interface SpendCreditParams {
	user: User | GuildMember;
	cost: number;
	serverId?: number;
	reason: string;
	/**
	 * Empty array represent not allowing tickets
	 * Undefined represent allowing all tickets
	 */
	acceptedTicketTypeIds?: string[];
	mustUseTickets?: boolean;
	skipPayment?: Resolvable<boolean>;
	/**
	 * When this param is provided, the default canSpendCredit check will be skipped, and the function will directly call this callback to check if the credit can be spent.
	 */
	onBeforeSpend?: (params: {
		user: User | GuildMember;
		finalCost: number;
		originalCost: number;
		tickets?: Ticket[];
	}) => Resolvable<boolean>;
}

/**
 * Spend credit for a user, if the user has enough credit, it will directly spend the credit.
 *
 * If the user has tickets that can be used for payment, it will ask the user to select a ticket or pay full price.
 *
 * If the user does not have enough credit and does not have any ticket, it will return null.
 *
 * After payment, it will send a notification to the user about the credit change.
 *
 * *Special case*: if the user has permission `skipPayment` (`1<<23`),
 * it will not spend credit and directly return a mock successful transaction **without** creating any transaction history.
 *
 * This is useful for staff or other special users who should not be charged for their actions.
 */
export async function spendCredit(
	channel: Channel | null,
	params: SpendCreditParams,
): Promise<PartialTransaction | null> {
	const {
		cost,
		reason,
		user,
		serverId,
		mustUseTickets,
		skipPayment,
		onBeforeSpend,
	} = params;
	const tickets = await getUserTicketsByUserId({
		userId: user.id,
		ticketTypeIds: params.acceptedTicketTypeIds,
		ticketEffectTypes: paymentTicketEffects,
	});
	if (mustUseTickets && tickets?.length === 0) return null;
	const credit = await getCredit(user.id);
	if (!credit) return null;

	const permission = await readPermission(user.id, serverId);
	if (comparePermission(permission, PermissionFlags.skipPayment)) {
		return {
			userId: user.id,
			changed: 0,
			originalAmount: 0,
			creditBefore: credit.currentCredit,
			creditAfter: credit.currentCredit,
			timestamp: Date.now(),
			reason: `${reason} (Payment skipped due to permissions)`,
			ticketUsed: null,
		};
	}
	if (
		!tickets ||
		params.acceptedTicketTypeIds?.length === 0 ||
		tickets.length === 0 ||
		!channel?.isSendable()
	) {
		return spendCreditWithoutTicket(user, credit, params);
	}
	const {
		channel: threadChannel,
		cleanUp,
		createdChannel,
	} = await getUserSelectTicketChannel(channel, user);
	const message = await threadChannel.send({
		content: `${createdChannel ? "" : `${userMention(user.id)}\n`}You need to pay \`${cost}\` credits for this action. You have \`${credit.currentCredit}\` credits.\nYou can also use a ticket to reduce the cost.`,
	});
	const {
		cancelled,
		tickets: selectedTickets,
		useTicket,
	} = await getUserSelectedTickets(message, user.id, tickets, {
		confirmationMessage: (ticket) => {
			const finalCost = calculatePaymentTicketEffects(
				ticket.map((t) => t.effect),
				cost,
			);
			return `After using this ticket, you will have to pay \`${finalCost}\` credits`;
		},
		insideThread: createdChannel,
		hideUseWithoutTicket: mustUseTickets,
	});
	await cleanUp(message);

	if (cancelled) {
		console.error("No ticket selected, cancelling payment.");
		return null;
	}
	if (selectedTickets && useTicket) {
		const finalCost = calculatePaymentTicketEffects(
			selectedTickets.map((t) => t.effect),
			cost,
		);
		if (onBeforeSpend) {
			if (
				(await resolve(
					onBeforeSpend({
						user,
						finalCost,
						originalCost: cost,
						tickets: selectedTickets,
					}),
				)) === false
			)
				return null;
		} else if (!(await canSpendCredit(user.id, finalCost))) return null;
		if (
			await useUserTicket(
				selectedTickets.map((v) => v.ticketId),
				reason,
			)
		) {
			const reasonString = `${reason} (Using Ticket(s): ${formatTicketNames(selectedTickets)}, saved ${cost - finalCost} credits)`;
			if (!(await resolve(skipPayment))) {
				await chargeCredit({
					user: user,
					creditChanged: -finalCost,
					reason: reasonString,
					serverId,
				});
			}
			return {
				userId: user.id,
				changed: -finalCost,
				originalAmount: -cost,
				creditBefore: credit.currentCredit,
				creditAfter: credit.currentCredit - finalCost,
				timestamp: Date.now(),
				reason: reasonString,
				ticketUsed: selectedTickets,
			};
		}
		await message.edit({
			content: "Failed to use the selected ticket. Paying full price.",
		});
	}
	if (onBeforeSpend) {
		if (
			(await onBeforeSpend({
				user,
				originalCost: cost,
				finalCost: cost,
			})) === false
		)
			return null;
	} else if (!(await canSpendCredit(user.id, cost))) return null;
	if (!(await resolve(skipPayment))) {
		await chargeCredit({
			user: user,
			creditChanged: -cost,
			reason,
			serverId,
		});
	}
	return {
		userId: user.id,
		changed: -cost,
		originalAmount: -cost,
		creditBefore: credit.currentCredit,
		creditAfter: credit.currentCredit - cost,
		timestamp: Date.now(),
		reason,
		ticketUsed: null,
	};
}

export async function chargeCredit(params: SendCreditNotificationParams) {
	const { user, creditChanged, serverId, reason } = params;
	await changeCredit({
		userId: user.id,
		change: creditChanged,
		serverId,
		reason,
	});
	await sendCreditNotification(params);
}

/**
 * Refund credit to user and send notification.
 *
 * This is usually used when an action failed after spending credit,
 * so we need to refund the credit back to user.
 */
export async function refundCredit(
	params: Omit<
		SendCreditNotificationParams,
		"cancellable" | "maxRefund" | "onRefund"
	>,
) {
	const { user, creditChanged, serverId, reason } = params;
	await changeCredit({
		userId: user.id,
		change: creditChanged,
		serverId,
		reason,
	});
	await sendCreditNotification(params);
}

interface SendCreditNotificationParams {
	user: User | PartialUser | GuildMember;
	creditChanged: number;
	reason: string;
	serverId?: number;
	silent?: boolean;
	cancellable?: boolean;
	maxRefund?: number;
	/**
	 * @param refundAmount Positive
	 */
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
			flags: silent ? MessageFlags.SuppressNotifications : [],
			components: cancellable
				? [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							createCancelTransactionButton(),
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

// For other uses, use createRequestComponents

export function createCancelTransactionButton() {
	return new ButtonBuilder()
		.setCustomId(CreditNotificationButtonId.CancelButton)
		.setLabel("Cancel Transaction")
		.setStyle(ButtonStyle.Danger);
}

export function createApproveTransactionButton() {
	return new ButtonBuilder()
		.setCustomId(CreditNotificationButtonId.ApproveButton)
		.setLabel("Approve Transaction")
		.setStyle(ButtonStyle.Success);
}
