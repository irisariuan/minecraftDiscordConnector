import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	italic,
	MessageFlags,
	time,
	type GuildMember,
	type PartialUser,
	type User,
} from "discord.js";
import {
	comparePermission,
	PermissionFlags,
	readPermission,
} from "./permission";
import { getUserById, newTransaction, setUserCredits } from "./db";

export interface UserCredit {
	currentCredit: number;
	histories: Change[];
}

export interface Change {
	creditAfter: number;
	creditBefore: number;
	changed: number;
	timestamp: number;
	reason?: string;
	trackingId: string;
	serverTag: string | null;
}

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
}: {
	userId: string;
	change: number;
	serverId?: number;
	reason: string;
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
			currentCredit: 0,
			histories: [],
		};
	}
	return {
		currentCredit: user.credits,
		histories: user.transactions
			.map(
				(v): Change => ({
					changed: v.amount,
					creditAfter: v.afterAmount,
					creditBefore: v.beforeAmount,
					timestamp: v.timestamp.getTime(),
					reason: v.reason || undefined,
					trackingId: v.id.toString(),
					serverTag: v.server?.tag ?? null,
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

export async function spendCredit({
	userId,
	cost,
	serverId,
	reason,
}: {
	userId: string;
	cost: number;
	serverId?: number;
	reason: string;
}) {
	if (!canSpendCredit(userId, cost)) return false;
	await changeCredit({ userId, change: -Math.abs(cost), serverId, reason });
	return true;
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
}: {
	user: User | PartialUser | GuildMember;
	creditChanged: number;
	reason: string;
	serverId?: number;
	silent?: boolean;
	cancellable?: boolean;
	maxRefund?: number;
	onRefund?: (refundAmount: number) => unknown;
}): Promise<boolean> {
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
