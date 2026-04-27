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
	deserializeEffectData,
	getUserSelectedTickets,
	getUserSelectTicketChannel,
	getUserTicketsByUserId,
	regularPaymentTicketEffects,
	TicketEffectType,
	useUserTicket,
	type Ticket,
} from "./ticket";
import { formatTicketNames } from "./utils/ticket";
import { resolve, type Resolvable } from "./utils";

/** A snapshot of a user's credit balance and full transaction history. */
export interface UserCredit {
	/** Discord user ID. */
	userId: string;
	/** Current credit balance. */
	currentCredit: number;
	/** All recorded transactions, sorted newest-first. */
	histories: Transaction[];
}

/** A fully-resolved credit transaction record. */
export interface Transaction {
	/** Discord user ID of the account that was charged / credited. */
	userId: string;
	/** Balance after the transaction was applied. */
	creditAfter: number;
	/** Balance before the transaction was applied. */
	creditBefore: number;
	/**
	 * Net credit change actually applied (may differ from `originalAmount`
	 * when tickets reduce the cost).
	 */
	changed: number;
	/** Requested credit change before any ticket discounts. */
	originalAmount: number;
	/** Tickets consumed during this transaction, or `null` if none were used. */
	ticketUsed: Ticket[] | null;
	/** Unix timestamp (ms) when the transaction occurred. */
	timestamp: number;
	/** Human-readable reason for the transaction. */
	reason?: string;
	/** Unique identifier for this transaction record. */
	trackingId: string;
	/** Tag of the server that initiated the transaction, or `null` if global. */
	serverTag: string | null;
	/** IDs of related ticket history entries, or `null` if none. */
	historyId: string[] | null;
}
/**
 * A lightweight transaction record returned by spend/charge helpers.
 * Omits fields that are only available after the record has been persisted
 * (`trackingId`, `historyId`, `serverTag`).
 */
export type PartialTransaction = Omit<
	Transaction,
	"trackingId" | "historyId" | "serverTag"
>;

/** Parameters for {@link setCredit}. */
export interface SetCreditParams {
	/** Discord user ID of the target account. */
	userId: string;
	/** Absolute credit value to set (not a delta). */
	credit: number;
	/** Optional server ID to associate with the resulting transaction record. */
	serverId?: number;
	/** Human-readable reason recorded in the transaction history. */
	reason: string;
}

/**
 * Sets a user's credit to an absolute value and records the change as a
 * transaction.
 *
 * @returns The user's previous credit balance, or `null` if the user could not
 *   be found / is not permitted to use the system.
 */
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

/** Parameters for {@link changeCredit}. */
export interface ChangeCreditParams {
	/** Discord user ID of the target account. */
	userId: string;
	/** Credit delta to apply (negative to deduct, positive to add). */
	change: number;
	/** Optional server ID to associate with the resulting transaction record. */
	serverId?: number;
	/** Human-readable reason recorded in the transaction history. */
	reason: string;
	/** IDs of ticket records to link to this transaction, if any. */
	ticketId?: string[];
}

/**
 * Applies a credit delta to a user's account and records the change as a
 * transaction.
 *
 * @returns The user's new credit balance, or `null` if the user could not be
 *   found / is not permitted to use the system.
 */
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

/**
 * Fetches the current credit balance and full transaction history for a user.
 *
 * If the user does not yet exist in the database but has the `use` permission,
 * a synthetic record with a zero balance is returned so callers don't need to
 * special-case new users.
 *
 * @returns A {@link UserCredit} object, or `null` if the user is not found and
 *   does not have the `use` permission.
 */
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
							effect: deserializeEffectData(
								t.ticket.effect,
								t.ticket.effectData,
							),
						})) ?? null,
					historyId: v.relatedTicketHistoryId,
				}),
			)
			.toSorted((a, b) => b.timestamp - a.timestamp),
	};
}

/**
 * Returns `true` when the user either has enough credit to cover `cost` or
 * holds a permission that bypasses the balance check (`noCreditCheck` or
 * `skipPayment`).
 */
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
/** Parameters for {@link spendCredit}. */
export interface SpendCreditParams {
	/** The Discord user or guild member being charged. */
	user: User | GuildMember;
	/**
	 * The channel in which the action is taking place.  Required to open a
	 * ticket-selection thread.  Pass `null` to skip ticket selection entirely.
	 */
	channel: Channel | null;
	/** Credit amount to charge (positive integer). */
	cost: number;
	/** Optional server ID to associate with the resulting transaction record. */
	serverId?: number;
	/** Human-readable reason recorded in the transaction history. */
	reason: string;
	/**
	 * Restricts which ticket types may be applied to this payment.
	 * - `undefined` — all ticket types are accepted.
	 * - Empty array — no tickets are accepted (full price only).
	 */
	acceptedTicketTypeIds?: string[];
	/**
	 * Restricts which ticket effect types are eligible for this payment.
	 * Defaults to `regularPaymentTicketEffects`.
	 */
	acceptedTicketEffectTypes?: TicketEffectType[];
	/**
	 * When `true`, the payment is aborted if the user has no applicable
	 * tickets (i.e. full-price payment is not offered as a fallback).
	 */
	mustUseTickets?: boolean;
	/**
	 * When resolves to `true`, the credit change is skipped but a successful
	 * `PartialTransaction` is still returned.  Useful for dry-run or preview
	 * flows.
	 */
	skipPayment?: Resolvable<boolean>;
	/**
	 * Maximum number of tickets the user may select in one payment.
	 * Defaults to the total number of eligible tickets.
	 */
	maxSelectableTickets?: number;
	/**
	 * Custom pre-spend gate.  When provided, the default `canSpendCredit`
	 * balance check is replaced by this callback.
	 *
	 * Return `false` (or a Promise resolving to `false`) to abort the payment.
	 *
	 * @param params.user         - The user being charged.
	 * @param params.finalCost    - Cost after any ticket discounts.
	 * @param params.originalCost - Original cost before discounts.
	 * @param params.tickets      - Tickets selected by the user, if any.
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
		channel,
		acceptedTicketTypeIds,
		acceptedTicketEffectTypes = regularPaymentTicketEffects,
		maxSelectableTickets,
	} = params;
	const tickets = await getUserTicketsByUserId({
		userId: user.id,
		ticketTypeIds: acceptedTicketTypeIds,
		ticketEffectTypes: acceptedTicketEffectTypes,
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
		acceptedTicketTypeIds?.length === 0 ||
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
		minSelect: 1,
		maxSelect: maxSelectableTickets ?? tickets.length,
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

/**
 * Applies a credit delta to a user's account **and** sends them a DM
 * notification about the change.
 *
 * This is the low-level primitive used by {@link spendCredit} and
 * {@link refundCredit}.  Prefer those higher-level helpers unless you need
 * precise control over the notification message.
 */
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

/** Parameters for {@link sendCreditNotification} and {@link chargeCredit}. */
interface SendCreditNotificationParams {
	/** The Discord user or guild member to notify. */
	user: User | PartialUser | GuildMember;
	/** Net credit change (negative for a deduction, positive for a credit). */
	creditChanged: number;
	/** Human-readable reason shown in the DM. */
	reason: string;
	/** Optional server ID used when recording a cancellation refund. */
	serverId?: number;
	/**
	 * When `true` the notification DM is sent with the
	 * `SuppressNotifications` flag so it does not ping the user.
	 * Defaults to `false`.
	 */
	silent?: boolean;
	/**
	 * When `true` a "Cancel Transaction" button is added to the DM that lets
	 * the user refund the charge within 10 minutes.
	 * Defaults to `false`.
	 */
	cancellable?: boolean;
	/**
	 * Upper bound on the refund amount when `cancellable` is `true`.
	 * Defaults to `0` (no cap — the full `creditChanged` amount is refunded).
	 */
	maxRefund?: number;
	/**
	 * Called when the user successfully cancels the transaction.
	 *
	 * @param refundAmount - The positive amount that was refunded.
	 */
	onRefund?: (refundAmount: number) => unknown;
}

/**
 * Sends the user a DM summarising a credit change.
 *
 * When `cancellable` is `true`, a "Cancel Transaction" button is included and
 * a collector is started that refunds the charge if the user clicks it within
 * 10 minutes.
 *
 * @returns `true` when the DM was sent successfully, `false` if the user
 *   could not be found / is not permitted to use the system.
 */
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

/** Custom IDs for the action buttons included in credit notification DMs. */
export enum CreditNotificationButtonId {
	/** Triggers a refund of the associated transaction. */
	CancelButton = "CANCEL_TRANSACTION",
	/** Marks the associated transaction as approved by the recipient. */
	ApproveButton = "APPROVE_TRANSACTION",
}

// For approval flows outside credit notifications use createRequestComponents instead.

/**
 * Creates a danger-styled "Cancel Transaction" button used in credit
 * notification DMs.
 */
export function createCancelTransactionButton() {
	return new ButtonBuilder()
		.setCustomId(CreditNotificationButtonId.CancelButton)
		.setLabel("Cancel Transaction")
		.setStyle(ButtonStyle.Danger);
}

/**
 * Creates a success-styled "Approve Transaction" button used in credit
 * notification DMs.
 */
export function createApproveTransactionButton() {
	return new ButtonBuilder()
		.setCustomId(CreditNotificationButtonId.ApproveButton)
		.setLabel("Approve Transaction")
		.setStyle(ButtonStyle.Success);
}
