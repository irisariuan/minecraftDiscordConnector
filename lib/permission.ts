import { User } from "discord.js";
import {
	getAllUserPermissions,
	getUserGlobalPermission,
	getUserLocalCombinedPermission,
	getUserLocalPermission,
	updateUserPermission,
	type UserPermission,
} from "./db";

export const PermissionFlags = {
	use: 1 << 0,
	readLog: 1 << 1,
	runCommand: 1 << 2,
	approve: 1 << 3,
	upload: 1 << 4,
	superApprove: 1 << 5,
	startServer: 1 << 6,
	stopServer: 1 << 7,

	downloadPlugin: 1 << 8,
	deletePlugin: 1 << 9,

	suspend: 1 << 10,
	editPerm: 1 << 11,
	repeatApproval: 1 << 12,

	creditFree: 1 << 13,
	creditEdit: 1 << 14,

	gift: 1 << 15,
	editSetting: 1 << 16,

	voteDownloadPlugin: 1 << 17,
	voteDeletePlugin: 1 << 18,
	receiveNotification: 1 << 19,
	editFiles: 1 << 20,
	editTicket: 1 << 21,
	approveEditFiles: 1 << 22,
} as const;

export const allPermission = Object.values(PermissionFlags).reduce(
	(acc, cur) => acc | cur,
	0,
);

export const PERMISSION = `${process.cwd()}/data/permissions.json`;

export type Permission = number | PermissionComparsion;

export type PermissionCompareType = "any" | "all";
export interface PermissionComparsion {
	type: PermissionCompareType;
	value: Permission[];
}

function compareNumberPermission(a: number, b: Permission): boolean {
	if (typeof b === "number") return (a & b) === b;
	if (b.type === "any")
		return b.value.some((v) => compareNumberPermission(a, v));
	return b.value.every((v) => compareNumberPermission(a, v));
}

export function comparePermission(
	a: UserPermission | number,
	b: Permission,
	serverId?: number,
): boolean {
	if (typeof a === "number") return compareNumberPermission(a, b);

	const relatedServerPerm = a.serverPermissions.find(
		(v) => v.serverId === serverId,
	);
	if (serverId && relatedServerPerm?.force) {
		return compareNumberPermission(relatedServerPerm.permission, b);
	}
	const finalPermission = relatedServerPerm
		? relatedServerPerm.permission | a.permission
		: a.permission;
	return compareNumberPermission(finalPermission, b);
}

export function compareAnyPermissions(a: number, b: number[]) {
	return b.some((v) => comparePermission(a, v));
}

export function compareAllPermissions(a: number, b: number[]) {
	return b.every((v) => comparePermission(a, v));
}

export async function readPermission(
	user: string | Pick<User, "id">,
	serverId?: number,
) {
	const userId = typeof user === "string" ? user : user.id;
	if (serverId !== undefined) {
		return (await getUserLocalCombinedPermission(userId, serverId)) ?? 0;
	}
	return (await getUserGlobalPermission(userId)) ?? 0;
}

export function createPermission(permissions: number[]) {
	return permissions.reduce((acc, cur) => acc | cur, 0);
}

/**
 * Slow function, change to use native db query if possible (raw sql)
 */
export async function getUsersWithMatchedPermission(
	permission: Permission,
	serverId?: number,
) {
	const allPerm = await getAllUserPermissions();

	const matchedUsers: string[] = [];
	for (const [userId, userPerm] of Object.entries(allPerm)) {
		if (comparePermission(userPerm.permission, permission, serverId)) {
			matchedUsers.push(userId);
			continue;
		}
	}
	return matchedUsers;
}

export function parsePermission(permission: number): string[] {
	return Object.entries(PermissionFlags)
		.filter(([_, value]) => comparePermission(permission, value))
		.map(([key]) => key);
}

export async function appendPermission(
	user: string,
	permission: number[] | number,
	serverId?: number,
	force?: boolean,
) {
	const currentPermission = serverId
		? ((await getUserLocalPermission(user, serverId)) ?? 0)
		: await readPermission(user);
	const newPermission = Array.isArray(permission)
		? createPermission(permission)
		: permission;
	const updatedPermission = currentPermission | newPermission;
	await updateUserPermission(user, updatedPermission, serverId, force);
	return updatedPermission;
}

export async function removePermission(
	user: string,
	permission: number[] | number,
	serverId?: number,
	force?: boolean,
) {
	const currentPermission = serverId
		? ((await getUserLocalPermission(user, serverId)) ?? 0)
		: await readPermission(user);
	const newPermission = Array.isArray(permission)
		? createPermission(permission)
		: permission;
	const updatedPermission = currentPermission & ~newPermission;
	await updateUserPermission(user, updatedPermission, serverId, force);
	return updatedPermission;
}

// Wrapper functions for PermissionComparsion
export function anyPerm(...permissions: Permission[]): PermissionComparsion {
	return {
		type: "any",
		value: permissions,
	};
}
export function allPerm(...permissions: Permission[]): PermissionComparsion {
	return {
		type: "all",
		value: permissions,
	};
}
