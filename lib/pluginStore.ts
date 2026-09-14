import { safeJoin } from "./utils";

/**
 * Namespaced, JSON-file-backed key/value store for plugins.
 *
 * Each namespace maps to `data/pluginState/<namespace>.json`. Plugins use this
 * (via the `store:*` request channels / the `createStore` API helper) to
 * persist small amounts of state — installed versions, hashes, cursors — without
 * needing their own file handling or a database migration.
 */
const STORE_DIR = `${process.cwd()}/data/pluginState`;

type StoreData = Record<string, unknown>;

/** In-memory authoritative cache, keyed by namespace. */
const cache = new Map<string, StoreData>();

/** Guards against path traversal / weird filenames in namespaces. */
function sanitizeNamespace(namespace: string): string {
	if (!/^[a-zA-Z0-9_-]{1,64}$/.test(namespace)) {
		throw new Error(
			`Invalid plugin store namespace: "${namespace}" (allowed: letters, digits, "_", "-", max 64 chars)`,
		);
	}
	return namespace;
}

function fileFor(namespace: string) {
	return safeJoin(STORE_DIR, `${sanitizeNamespace(namespace)}.json`);
}

async function load(namespace: string): Promise<StoreData> {
	const cached = cache.get(namespace);
	if (cached) return cached;
	const file = Bun.file(fileFor(namespace));
	const data: StoreData = (await file.exists())
		? await file.json().catch(() => ({}))
		: {};
	cache.set(namespace, data);
	return data;
}

async function persist(namespace: string, data: StoreData) {
	cache.set(namespace, data);
	// Bun.write creates the parent directory automatically.
	await Bun.write(fileFor(namespace), JSON.stringify(data, null, 2));
}

export async function storeGet(
	namespace: string,
	key: string,
): Promise<unknown> {
	const data = await load(namespace);
	return key in data ? data[key] : null;
}

export async function storeGetAll(namespace: string): Promise<StoreData> {
	return { ...(await load(namespace)) };
}

export async function storeSet(
	namespace: string,
	key: string,
	value: unknown,
): Promise<void> {
	const data = await load(namespace);
	data[key] = value;
	await persist(namespace, data);
}

export async function storeDelete(
	namespace: string,
	key: string,
): Promise<void> {
	const data = await load(namespace);
	if (key in data) {
		delete data[key];
		await persist(namespace, data);
	}
}
