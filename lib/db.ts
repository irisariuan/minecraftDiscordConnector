import { prisma } from "./prisma";
import {
	comparePermission,
	PermissionFlags,
	readPermission,
} from "./permission";
import type { Prisma } from "../generated/prisma/client";

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
	if (!comparePermission(await readPermission(userId), PermissionFlags.use))
		return null;
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

export async function selectServerById(id: number) {
	return prisma.server.findUnique({ where: { id } });
}

export async function createServer(data: Prisma.ServerCreateInput) {
	return prisma.server.create({ data });
}

export async function getAllServers() {
	return prisma.server.findMany();
}

export async function getAllServerIds() {
	return prisma.server.findMany({ select: { id: true } });
}

export async function hasAnyServer() {
	return (await prisma.server.count()) > 0;
}
