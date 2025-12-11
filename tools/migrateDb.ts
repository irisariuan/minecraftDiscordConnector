import type { UserCredit } from "../lib/credit";
import { createUser, newBulkTransactions } from "../lib/db";

export const CREDIT = `${process.cwd()}/data/credit.json`;

interface CreditJson {
	users: Record<string, UserCredit>;
	jackpot: number;
	jackpotNumber: number;
}

async function getCreditJson(): Promise<CreditJson> {
	const file = Bun.file(CREDIT);
	const fallback = {
		users: {},
		jackpot: 0,
		jackpotNumber: 0,
	};
	if (!(await file.exists())) {
		await Bun.write(CREDIT, JSON.stringify(fallback, null, 4));
		return fallback;
	}
	return await file.json().catch(() => fallback);
}

async function readPermissionJson(): Promise<Record<string, number>> {
	const file = Bun.file(process.cwd() + "/data/permissions.json");
	if (!(await file.exists())) {
		return {};
	}
	return await file.json().catch(() => ({}));
}

const creditJson = await getCreditJson();
const permissionJson = await readPermissionJson();

for (const [userId, details] of Object.entries(creditJson.users)) {
	console.log(`Migrating credit for user ${userId}`);
	await createUser({
		id: userId,
		credits: details.currentCredit,
		permission: permissionJson[userId] ?? 0,
	});
	await newBulkTransactions(
		details.histories.map((history) => ({
			userId,
			afterAmount: history.creditAfter,
			beforeAmount: history.creditBefore,
			amount: history.changed,
			reason: history.reason,
			timestamp: new Date(history.timestamp),
		})),
	);
	console.log(
		`Migrated ${details.histories.length} transactions for user ${userId}`,
	);
}
