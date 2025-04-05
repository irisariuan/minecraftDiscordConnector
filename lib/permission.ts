import { CacheItem } from "./cache"

export const PermissionFlags = {
    use: 1 << 0,
    readLog: 1 << 1,
    runCommand: 1 << 2,
    approve: 1 << 3,
    upload: 1 << 4,
} as const

export const PERMISSION = `${process.cwd()}/data/permissions.json`

export type Permission = typeof PermissionFlags[keyof typeof PermissionFlags]
const permissionCache = new Map<string, CacheItem<Permission>>()

export function comparePermission(a: Permission, b: Permission | Permission[]) {
    if (Array.isArray(b)) {
        return b.every(v => (a & v) === v)
    }
    return (a & b) === b
}

export function createPermission(permissions: Permission[]) {
    return permissions.reduce((acc, cur) => acc | cur, 0)
}

async function readPermissionJson() {
    if (!Bun.file(PERMISSION).exists()) {
        await Bun.write(PERMISSION, '{')
    }
    return await Bun.file(PERMISSION).json().catch(() => ({})) as Record<string, Permission>
}

export async function writePermission(user: string, permission: Permission) {
    const cache = permissionCache.get(user)
    if (cache) {
        cache.setData(permission)
    } else {
        permissionCache.set(user, new CacheItem(permission))
    }
    const permissions = await readPermissionJson()
    permissions[user] = permission
    await Bun.write(PERMISSION, JSON.stringify(permissions, null, 4))
}

export async function readPermission(user: string) {
    const cache = permissionCache.get(user)?.getData()
    if (cache) {
        return cache
    }
    const permissions = await readPermissionJson()
    return permissions[user] || 0
}
export async function appendPermission(user: string, permission: Permission[] | Permission) {
    const currentPermission = await readPermission(user)
    const newPermission = Array.isArray(permission) ? createPermission(permission) : permission
    const updatedPermission = currentPermission | newPermission
    await writePermission(user, updatedPermission)
    return updatedPermission
}

export async function removePermission(user: string, permission: Permission[] | Permission) {
    const currentPermission = await readPermission(user)
    const newPermission = Array.isArray(permission) ? createPermission(permission) : permission
    const updatedPermission = currentPermission & ~newPermission
    await writePermission(user, updatedPermission)
    return updatedPermission
}