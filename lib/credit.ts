import {
    italic,
	MessageFlags,
	type GuildMember,
	type PartialUser,
	type User,
} from "discord.js";
import { CacheItem } from "./cache";
import {
	comparePermission,
	PermissionFlags,
	readPermission,
} from "./permission";

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
}

interface CreditJson {
	users: Record<string, UserCredit>;
	jackpot: number;
}

export const CREDIT = `${process.cwd()}/data/credit.json`;
const creditCache = new Map<string, CacheItem<UserCredit>>();
const jackpotCache = new CacheItem<number>(null);

export let jackpotNumber = getRandomJackpotNumber();

export function changeJackpotNumber() {
	jackpotNumber = getRandomJackpotNumber();
	return jackpotNumber
}

function getRandomJackpotNumber() {
	return Math.floor(Math.random() * 10000) + 1;
}

async function getCreditJson() {
	const file = Bun.file(CREDIT);
	if (!(await file.exists())) {
		await Bun.write(CREDIT, "{users:{}, jackpot: 0}");
		return { users: {}, jackpot: 0 };
	}
	return (await file
		.json()
		.catch(
			() => ({ users: {}, jackpot: 0 }) as CreditJson,
		)) as Promise<CreditJson>;
}

export async function writeCredit(userId: string, credit: UserCredit) {
	const currentCredit = await getCreditJson();
	currentCredit.users[userId] = credit;
	if (creditCache.has(userId)) {
		creditCache.get(userId)?.setData(credit);
	} else {
		creditCache.set(userId, new CacheItem(credit));
	}
	await Bun.write(CREDIT, JSON.stringify(currentCredit, null, 4));
}

export async function setCredit(
	userId: string,
	credit: number,
	reason: string,
) {
	const userCreditFetched = await getCredit(userId);
	const originalCredit = userCreditFetched.currentCredit;
	userCreditFetched.histories.push({
		changed: credit - userCreditFetched.currentCredit,
		creditAfter: credit,
		creditBefore: userCreditFetched.currentCredit,
		timestamp: Date.now(),
		reason,
	});
	userCreditFetched.currentCredit = credit;
	await writeCredit(userId, userCreditFetched);
	return originalCredit;
}

export async function changeCredit(
	userId: string,
	change: number,
	reason: string,
) {
	const userCreditFetched = await getCredit(userId);
	userCreditFetched.histories.push({
		changed: change,
		creditAfter: userCreditFetched.currentCredit + change,
		creditBefore: userCreditFetched.currentCredit,
		timestamp: Date.now(),
		reason,
	});
	userCreditFetched.currentCredit += change;
	await writeCredit(userId, userCreditFetched);
	return userCreditFetched.currentCredit;
}

export async function getCredit(userId: string): Promise<UserCredit> {
	if (creditCache.has(userId)) {
		const data = await creditCache.get(userId)?.getData();
		if (data) return data;
	}
	const currentCredit = await getCreditJson();
	if (currentCredit.users[userId]) {
		creditCache.set(userId, new CacheItem(currentCredit.users[userId]));
		return currentCredit.users[userId];
	}
	return {
		currentCredit: 0,
		histories: [],
	};
}

export async function spendCredit(
	userId: string,
	cost: number,
	reason: string,
	addToJackpot = true,
) {
	const credit = await getCredit(userId);
	const permission = await readPermission(userId);
	if (
		credit.currentCredit < cost &&
		!comparePermission(permission, PermissionFlags.creditFree)
	)
		return false;
	await changeCredit(userId, -Math.abs(cost), reason);
	if (addToJackpot) {
		setJackpot((await getJackpot()) + Math.abs(cost));
	}
	return true;
}

export async function getJackpot(): Promise<number> {
	const data = await jackpotCache.getData();
	if (data !== null) return data;
	const currentCredit = await getCreditJson();
	jackpotCache.setData(currentCredit.jackpot);
	return currentCredit.jackpot;
}

export async function setJackpot(amount: number) {
	jackpotCache.setData(amount);
	const currentCredit = await getCreditJson();
	currentCredit.jackpot = amount;
	await Bun.write(CREDIT, JSON.stringify(currentCredit, null, 4));
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
			content: `Your credit has been changed by \`${creditChanged}\`. Your current credit is \`${creditFetched.currentCredit}\`\nReason: ${italic(reason)}\n\n*You could always check your credit by using \`/credit\` command.*`,
			flags: silent ? [MessageFlags.SuppressNotifications] : [],
		})
		.catch((err) => console.error("Error occured during DM", err));
}
