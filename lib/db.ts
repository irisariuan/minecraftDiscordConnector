import { Prisma } from "../generated/prisma/client";
import {
	comparePermission,
	PermissionFlags,
	readPermission,
} from "./permission";
import { prisma } from "./prisma";

export enum SettingType {
	ServerCredit = "serverCredit",
	Approval = "approval",
}

export type DbServer = Prisma.ServerModel;

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
			transactions: {
				include: {
					server: true,
					relatedTicketHistory: true,
					ticket: { include: { ticket: true } },
				},
			},
		},
	});
}

export async function newTransaction(data: Prisma.TransactionCreateInput) {
	return prisma.transaction.create({ data });
}

export async function newBulkTransactions(
	data: Prisma.TransactionCreateManyInput[],
) {
	return prisma.transaction.createMany({ data });
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

export async function getAllServers(): Promise<DbServer[]> {
	return prisma.server.findMany();
}

export async function getAllServerIds() {
	return prisma.server.findMany({ select: { id: true } });
}

export async function updateServer(id: number, data: Prisma.ServerUpdateInput) {
	return prisma.server.update({ where: { id }, data });
}

export async function deleteServer(id: number) {
	return prisma.server.delete({ where: { id } });
}

export async function hasAnyServer() {
	return (await prisma.server.count()) > 0;
}

export async function getServerSettings(serverId: number, type?: SettingType) {
	return await prisma.setting.findMany({
		where: { serverId, type },
	});
}

export async function upsertSetting(data: Prisma.SettingUpsertArgs) {
	return await prisma.setting.upsert(data);
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

export async function getPluginsByServerId(serverId: number) {
	return await prisma.plugin.findMany({ where: { serverId } });
}

export async function deletePluginRecord(
	projectId: string,
	versionId: string,
	serverId: number,
) {
	return await prisma.plugin
		.delete({
			where: {
				projectId_versionId_serverId: {
					projectId,
					versionId,
					serverId,
				},
			},
		})
		.catch(() => null);
}

export async function getUserTickets(
	userId: string,
	ticketTypeIds?: string[],
	ticketEffectTypes?: string[],
) {
	return await prisma.userTicket.findMany({
		where: {
			userId,
			...(ticketTypeIds ? { ticket: { id: { in: ticketTypeIds } } } : {}),
			...(ticketEffectTypes
				? {
						ticket: { effect: { in: ticketEffectTypes } },
					}
				: {}),
		},
		include: { ticket: true, history: true },
	});
}

export async function getAllRawActiveTickets() {
	return await prisma.userTicket.findMany({
		where: { OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }] },
		include: { ticket: true, history: true },
	});
}

export async function getRawUserTicket(data: Prisma.UserTicketFindUniqueArgs) {
	return await prisma.userTicket.findUnique(data);
}

export async function getRawUserTickets(data: Prisma.UserTicketFindManyArgs) {
	return await prisma.userTicket.findMany(data);
}

export async function createRawUserTicket(data: Prisma.UserTicketCreateArgs) {
	return await prisma.userTicket.create(data);
}

export async function createRawUserTicketWithTicketType(
	data: Prisma.UserTicketCreateArgs,
) {
	return await prisma.userTicket.create({
		...data,
		include: { ticket: true },
	});
}

export async function updateRawUserTicket(data: Prisma.UserTicketUpdateArgs) {
	return await prisma.userTicket.update({
		...data,
		include: { ticket: true, history: true },
	});
}
export async function createTicketHistory(
	data: Prisma.TicketHistoryCreateArgs,
) {
	return await prisma.ticketHistory.create(data);
}

export async function createBulkTicketHistories(
	data: Prisma.TicketHistoryCreateManyInput[],
) {
	return await prisma.ticketHistory.createMany({ data });
}

export async function countTicketHistories(ticketId: string) {
	return await prisma.ticketHistory.count({ where: { ticketId } });
}

export async function createRawTicketType(data: Prisma.TicketCreateArgs) {
	return await prisma.ticket.create(data);
}

export async function getRawTicketTypeById(id: string) {
	return await prisma.ticket.findUnique({ where: { id } });
}

export async function getAllRawTicketTypes() {
	return await prisma.ticket.findMany();
}

export async function getRawUserTicketByTicketId(ticketId: string) {
	return await prisma.userTicket.findUnique({
		where: { id: ticketId },
		include: { ticket: true, history: true },
	});
}

export async function updateRawTicketType(data: Prisma.TicketUpdateArgs) {
	return await prisma.ticket.update(data);
}

export async function deleteRawTicketTypeById(id: string) {
	return await prisma.ticket.deleteMany({ where: { id } });
}

export async function deleteRawUserTicket(data: Prisma.UserTicketDeleteArgs) {
	return await prisma.userTicket.delete(data);
}

export async function createPlayer(data: Prisma.PlayerCreateArgs) {
	return await prisma.player.create(data);
}
export async function hasPlayer(uuid: string) {
	const count = await prisma.player.count({ where: { uuid } });
	return count > 0;
}
export async function getPlayerByUuid(uuid: string) {
	return await prisma.player.findUnique({ where: { uuid } });
}
export async function updatePlayerName(uuid: string, name: string) {
	try {
		return await prisma.player.update({
			where: { uuid },
			data: { playername: name },
		});
	} catch (e) {
		console.error(`Failed to update player name for uuid ${uuid}:`, e);
		return null;
	}
}
export async function getPlayerByName(name: string) {
	return await prisma.player.findMany({ where: { playername: name } });
}
export async function deletePlayerByUuid(uuid: string) {
	return await prisma.player.delete({ where: { uuid } });
}

// ─── Server Access (allowlist) ────────────────────────────────────────────────

/**
 * Add a server to a user's access allowlist.
 * Once a user has ANY entries, they can ONLY access those servers.
 */
export async function addServerAccess(userId: string, serverId: number) {
	return prisma.serverAccess.upsert({
		create: { userId, serverId },
		update: {},
		where: { userId_serverId: { userId, serverId } },
	});
}

/**
 * Remove a specific server from a user's allowlist.
 */
export async function removeServerAccess(userId: string, serverId: number) {
	return prisma.serverAccess.deleteMany({ where: { userId, serverId } });
}

/**
 * Get all servers in a user's allowlist (with server data included).
 */
export async function getServerAccessByUserId(userId: string) {
	return prisma.serverAccess.findMany({
		where: { userId },
		include: { server: true },
	});
}

/**
 * Remove all server access restrictions for a user (restores full access).
 */
export async function clearServerAccess(userId: string) {
	return prisma.serverAccess.deleteMany({ where: { userId } });
}

/**
 * Return the list of server IDs the user is allowed to access.
 * Returns `null` when the user has no restrictions (may access all servers).
 */
export async function getUserAccessibleServerIds(
	userId: string,
): Promise<number[] | null> {
	const access = await prisma.serverAccess.findMany({
		where: { userId },
		select: { serverId: true },
	});
	if (access.length === 0) return null; // null = unrestricted
	return access.map((a) => a.serverId);
}
