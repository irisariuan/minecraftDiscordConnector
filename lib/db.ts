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

// ─── Server artifacts (generic mods/plugins/packages) ─────────────────────────

export interface UpsertServerArtifactData {
	provider: string;
	artifactId: string;
	versionId: string;
	serverId: number;
	filePath: string;
	metadata?: Record<string, unknown>;
}

export async function upsertServerArtifact({
	provider,
	artifactId,
	versionId,
	serverId,
	filePath,
	metadata,
}: UpsertServerArtifactData) {
	const json = metadata as Prisma.InputJsonValue | undefined;
	return await prisma.serverArtifact.upsert({
		create: {
			provider,
			artifactId,
			versionId,
			serverId,
			filePath,
			...(json !== undefined ? { metadata: json } : {}),
		},
		update: {
			filePath,
			...(json !== undefined ? { metadata: json } : {}),
		},
		where: {
			provider_artifactId_versionId_serverId: {
				provider,
				artifactId,
				versionId,
				serverId,
			},
		},
	});
}

export async function getServerArtifact(
	provider: string,
	artifactId: string,
	versionId: string,
	serverId: number,
) {
	return await prisma.serverArtifact.findUnique({
		where: {
			provider_artifactId_versionId_serverId: {
				provider,
				artifactId,
				versionId,
				serverId,
			},
		},
	});
}

export async function deleteServerArtifactByPath(path: string) {
	return await prisma.serverArtifact.deleteMany({ where: { filePath: path } });
}

export async function getServerArtifactsByServerId(
	serverId: number,
	provider?: string,
) {
	return await prisma.serverArtifact.findMany({
		where: { serverId, ...(provider ? { provider } : {}) },
	});
}

export async function deleteServerArtifactRecord(
	provider: string,
	artifactId: string,
	versionId: string,
	serverId: number,
) {
	return await prisma.serverArtifact
		.delete({
			where: {
				provider_artifactId_versionId_serverId: {
					provider,
					artifactId,
					versionId,
					serverId,
				},
			},
		})
		.catch(() => null);
}

export type ServerArtifactRecord = Awaited<
	ReturnType<typeof getServerArtifactsByServerId>
>[number];

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

// ─── Identity links (generic external-identity ↔ Discord) ─────────────────────

export interface CreateIdentityLinkData {
	pluginId: string;
	externalId: string;
	discordId: string;
	serverId?: number;
	metadata?: Record<string, unknown>;
}

export async function createIdentityLink({
	pluginId,
	externalId,
	discordId,
	serverId,
	metadata,
}: CreateIdentityLinkData) {
	const json = metadata as Prisma.InputJsonValue | undefined;
	return await prisma.identityLink.create({
		data: {
			pluginId,
			externalId,
			discordId,
			serverId,
			...(json !== undefined ? { metadata: json } : {}),
		},
	});
}

export async function hasIdentityLink(pluginId: string, externalId: string) {
	const count = await prisma.identityLink.count({
		where: { pluginId, externalId },
	});
	return count > 0;
}

export async function getIdentityByExternalId(
	pluginId: string,
	externalId: string,
) {
	return await prisma.identityLink.findUnique({
		where: { pluginId_externalId: { pluginId, externalId } },
	});
}

export async function getIdentitiesByDiscordId(
	pluginId: string,
	discordId: string,
) {
	return await prisma.identityLink.findMany({
		where: { pluginId, discordId },
	});
}

export async function updateIdentityMetadata(
	pluginId: string,
	externalId: string,
	metadata: Record<string, unknown>,
) {
	try {
		return await prisma.identityLink.update({
			where: { pluginId_externalId: { pluginId, externalId } },
			data: { metadata: metadata as Prisma.InputJsonValue },
		});
	} catch (e) {
		console.error(
			`Failed to update identity metadata for ${pluginId}:${externalId}:`,
			e,
		);
		return null;
	}
}

export async function deleteIdentityLink(pluginId: string, externalId: string) {
	return await prisma.identityLink
		.delete({ where: { pluginId_externalId: { pluginId, externalId } } })
		.catch(() => null);
}

export type IdentityLinkRecord = NonNullable<
	Awaited<ReturnType<typeof getIdentityByExternalId>>
>;

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
