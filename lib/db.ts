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

export async function getUserByIdWithoutTransactions(id: string) {
	return prisma.user.findUnique({ where: { id } });
}

export async function getUserById(id: string) {
	return prisma.user.findUnique({
		where: { id },
		include: {
			transactions: { include: { server: true } },
		},
	});
}

export async function newTransaction(data: Prisma.TransactionCreateInput) {
	return prisma.transaction.create({ data });
}

export async function getTransactionsByUserId(
	userId: string,
	includeServer = true,
) {
	return prisma.transaction.findMany({
		where: { userId },
		include: { server: includeServer },
	});
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

export async function updateUserPermission(
	userId: string,
	permission: number,
	serverId?: number,
	force?: boolean,
) {
	if (serverId) {
		return prisma.permission.upsert({
			create: { userId, serverId, permission, force },
			update: { permission, force },
			where: { userId, serverId },
		});
	}
	return prisma.user.upsert({
		create: { id: userId, permission },
		update: { permission },
		where: { id: userId },
	});
}

export async function getUserLocalPermission(userId: string, serverId: number) {
	const serverPerm = await prisma.permission.findUnique({
		where: { userId, serverId },
	});
	return serverPerm?.permission ?? null;
}

export async function getUserLocalCombinedPermission(
	userId: string,
	serverId: number,
) {
	const serverPerm = await prisma.permission.findUnique({
		where: { userId, serverId },
		include: { user: true },
	});
	if (!serverPerm) {
		return await getUserGlobalPermission(userId);
	}
	if (serverPerm.force) return serverPerm.permission;
	return serverPerm.user.permission | serverPerm.permission;
}

export async function getUserGlobalPermission(userId: string) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			permission: true,
			permissions: { include: { server: true } },
		},
	});
	return user?.permission ?? null;
}

export interface UserServerPermission {
	permission: number;
	serverId: number;
	serverTag: string | null;
	force: boolean;
}
export interface UserPermission {
	permission: number;
	serverPermissions: UserServerPermission[];
}

export async function getAllUserPermissions(): Promise<
	Record<string, UserPermission>
> {
	const users = await prisma.user.findMany({
		select: {
			id: true,
			permission: true,
			permissions: { include: { server: true } },
		},
	});
	const result: Record<string, UserPermission> = {};
	for (const user of users) {
		result[user.id] = {
			permission: user.permission,
			serverPermissions: user.permissions.map((perm) => ({
				permission: perm.permission,
				serverId: perm.serverId,
				serverTag: perm.server?.tag,
				force: perm.force,
			})),
		};
	}
	return result;
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

export async function getServerCreditSettings(serverId: number) {
	return await prisma.serverCreditSetting.findUnique({ where: { serverId } });
}

export async function upsertServerCreditSettings(
	data: Prisma.ServerCreditSettingUpsertArgs,
) {
	return await prisma.serverCreditSetting.upsert(data);
}

export async function upsertNewPlugin(data: Prisma.PluginUpsertArgs) {
	return await prisma.plugin.upsert(data);
}
export async function getPluginByIds(
	projectId: string,
	versionId: string,
	serverId: number,
) {
	return await prisma.plugin.findUnique({
		where: {
			projectId_versionId_serverId: { projectId, versionId, serverId },
		},
	});
}
export async function deletePluginByPath(path: string) {
	return await prisma.plugin.deleteMany({ where: { filePath: path } });
}
