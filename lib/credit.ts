import {
	italic,
	MessageFlags,
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
}

export async function setCredit(
	userId: string,
	credit: number,
	reason: string,
) {
	const userCreditFetched = await getCredit(userId);
	await newTransaction({
		user: {
			connectOrCreate: { create: { id: userId }, where: { id: userId } },
		},
		afterAmount: credit,
		beforeAmount: userCreditFetched.currentCredit,
		amount: credit - userCreditFetched.currentCredit,
		reason,
		timestamp: new Date(),
	});
	await setUserCredits(userId, credit);
	return userCreditFetched.currentCredit;
}

export async function changeCredit(
	userId: string,
	change: number,
	reason: string,
) {
	const userCreditFetched = await getCredit(userId);

	await newTransaction({
		user: {
			connectOrCreate: { create: { id: userId }, where: { id: userId } },
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

export async function getCredit(userId: string): Promise<UserCredit> {
	const user = await getUserById(userId, true);
	if (!user) {
		return {
			currentCredit: 0,
			histories: [],
		};
	}
	return {
		currentCredit: user.credits,
		histories: user.transactions
			.map((v) => ({
				changed: v.amount,
				creditAfter: v.afterAmount,
				creditBefore: v.beforeAmount,
				timestamp: v.timestamp.getTime(),
				reason: v.reason || undefined,
				trackingId: v.id.toString(),
			}))
			.toSorted((a, b) => b.timestamp - a.timestamp),
	};
}

export async function canSpendCredit(userId: string, cost: number) {
	const credit = await getCredit(userId);
	const permission = await readPermission(userId);
	return (
		credit.currentCredit >= cost ||
		comparePermission(permission, PermissionFlags.creditFree)
	);
}

export async function spendCredit(
	userId: string,
	cost: number,
	reason: string,
) {
	if (!canSpendCredit(userId, cost)) return false;
	await changeCredit(userId, -Math.abs(cost), reason);
	return true;
}

export async function sendCreditNotification(
	user: User | PartialUser | GuildMember,
	creditChanged: number,
	reason: string,
	silent = false,
) {
	const creditFetched = await getCredit(user.id);
	await user
		.send({
			content: `Your credit has been changed by \`${creditChanged}\`. Your current credit is \`${creditFetched.currentCredit}\`\nReason: ${italic(reason)}\n*You could always check your credit by using \`/credit\` command.*`,
			flags: silent ? [MessageFlags.SuppressNotifications] : [],
		})
		.catch((err) => console.error("Error occured during DM", err));
}
