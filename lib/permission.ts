import { User } from "discord.js";
import {
	getAllUserPermissions,
	getUserPermission,
	updateUserPermission,
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

export function comparePermission(a: number, b: Permission): boolean {
	if (typeof b === "number") return (a & b) === b;
	if (b.type === "any") return b.value.some((v) => comparePermission(a, v));
	return b.value.every((v) => comparePermission(a, v));
}

export function compareAnyPermissions(a: number, b: number[]) {
	return b.some((v) => comparePermission(a, v));
}

export function compareAllPermissions(a: number, b: number[]) {
	return b.every((v) => comparePermission(a, v));
}

export async function readPermission(user: string | Pick<User, "id">) {
	return (
		(await getUserPermission(typeof user === "string" ? user : user.id)) ??
		0
	);
}

export function createPermission(permissions: number[]) {
	return permissions.reduce((acc, cur) => acc | cur, 0);
}

export async function getUsersMatchedPermission(permission: Permission) {
	const allPerm = await getAllUserPermissions();
	return Object.entries(allPerm)
		.filter(([_, perm]) => comparePermission(perm, permission))
		.map(([user]) => user);
}

export function parsePermission(permission: number): string[] {
	return Object.entries(PermissionFlags)
		.filter(([_, value]) => comparePermission(permission, value))
		.map(([key]) => key);
}

export async function appendPermission(
	user: string,
	permission: number[] | number,
) {
	const currentPermission = await readPermission(user);
	const newPermission = Array.isArray(permission)
		? createPermission(permission)
		: permission;
	const updatedPermission = currentPermission | newPermission;
	await updateUserPermission(user, updatedPermission);
	return updatedPermission;
}

export async function removePermission(
	user: string,
	permission: number[] | number,
) {
	const currentPermission = await readPermission(user);
	const newPermission = Array.isArray(permission)
		? createPermission(permission)
		: permission;
	const updatedPermission = currentPermission & ~newPermission;
	await updateUserPermission(user, updatedPermission);
	return updatedPermission;
}

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
