import { Prisma, PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

export async function createUser(data: Prisma.UserCreateInput) {
	return prisma.user.create({ data });
}

export async function getUserById(id: string, includeTransactions = false) {
	return prisma.user.findUnique({
		where: { id },
		include: { transactions: includeTransactions },
	});
}

export async function newTransaction(data: Prisma.TransactionCreateInput) {
	return prisma.transaction.create({ data });
}

export async function getTransactionsByUserId(userId: string) {
	return prisma.transaction.findMany({ where: { userId } });
}

export async function setUserCredits(userId: string, credits: number) {
	return prisma.user.upsert({
		create: { id: userId, credits },
		update: { credits },
		where: { id: userId },
	});
}

export async function updateUserPermission(userId: string, permission: number) {
	return prisma.user.upsert({
		create: { id: userId, permission },
		update: { permission },
		where: { id: userId },
	});
}
export async function getUserPermission(userId: string) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { permission: true },
	});
	return user?.permission ?? null;
}

export async function getAllUserPermissions() {
	const users = await prisma.user.findMany({
		select: { id: true, permission: true },
	});
	return users.reduce(
		(acc, user) => ({ ...acc, [user.id]: user.permission }),
		{} as Record<string, number>,
	);
}
