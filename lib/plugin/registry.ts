import { safeJoin } from "../utils";
import type { CapabilityName, GamePlugin } from "./contract";

export type { GamePlugin };

/**
 * A game plugin as held by the registry. Plugins are heterogeneous in their
 * config type; TypeScript has no existential generics, so the registry erases
 * the config type at this single boundary. Plugin authors keep full type-safety
 * at definition time via {@link defineGamePlugin}, and the core treats config as
 * an opaque `Record` (validated at the plugin boundary before use).
 */
// biome-ignore lint/suspicious/noExplicitAny: existential plugin-config boundary
export type AnyGamePlugin = GamePlugin<any>;

/** The core-facing view: config is an opaque record. */
export type RegisteredGamePlugin = GamePlugin<Record<string, unknown>>;

/**
 * Registry of game plugins. Populated deterministically at startup from
 * `plugins/**\/*.game.ts` modules (see {@link loadGamePlugins}). Selection of a
 * server's implementation is registry-driven — the core keeps no hard-coded game
 * list.
 */
const byId = new Map<string, AnyGamePlugin>();
const runtimeToId = new Map<string, string>();

/**
 * Register a game plugin. Throws (loudly, at load time) on a duplicate plugin id
 * or a runtime id already claimed by another plugin, so conflicts never resolve
 * to "whichever module loaded first".
 */
export function registerGamePlugin(plugin: AnyGamePlugin): void {
	if (byId.has(plugin.id)) {
		throw new Error(
			`Duplicate game plugin id "${plugin.id}" — each plugin id must be unique.`,
		);
	}
	for (const runtime of plugin.runtimeIds) {
		const owner = runtimeToId.get(runtime);
		if (owner && owner !== plugin.id) {
			throw new Error(
				`Runtime id "${runtime}" is already provided by plugin "${owner}"; ` +
					`plugin "${plugin.id}" cannot also claim it.`,
			);
		}
	}
	byId.set(plugin.id, plugin);
	for (const runtime of plugin.runtimeIds) {
		runtimeToId.set(runtime, plugin.id);
	}
}

/** Look up a plugin by id, or undefined if not registered. */
export function getGamePlugin(id: string): RegisteredGamePlugin | undefined {
	return byId.get(id) as RegisteredGamePlugin | undefined;
}

/**
 * Look up a plugin by id, throwing an actionable error when it is missing or
 * disabled. Used on any path that requires a server's game implementation, so a
 * record with an unknown `pluginId` fails clearly instead of silently falling
 * back to another game.
 */
export function requireGamePlugin(
	id: string,
	serverId?: number,
): RegisteredGamePlugin {
	const plugin = byId.get(id);
	if (!plugin) {
		const where = serverId !== undefined ? ` (server #${serverId})` : "";
		throw new Error(
			`Game plugin "${id}"${where} is not loaded or is disabled. ` +
				`Enable the plugin that provides it, or migrate the server to an available game plugin.`,
		);
	}
	return plugin as RegisteredGamePlugin;
}

/** Resolve the plugin id that provides a given runtime id, if any. */
export function getPluginIdForRuntime(runtime: string): string | undefined {
	return runtimeToId.get(runtime);
}

/** True when the plugin declares the named capability. */
export function pluginHasCapability(
	plugin: RegisteredGamePlugin,
	capability: CapabilityName,
): boolean {
	return Boolean(plugin.capabilities?.[capability]);
}

/** All registered plugins, sorted by id for deterministic display. */
export function getAllGamePlugins(): RegisteredGamePlugin[] {
	return [...byId.values()].sort((a, b) =>
		a.id.localeCompare(b.id),
	) as RegisteredGamePlugin[];
}

/** Test-only: clear the registry between cases. */
export function resetRegistry(): void {
	byId.clear();
	runtimeToId.clear();
}

/**
 * Discover and register every `*.game.ts` module under `plugins/`. Loaded in a
 * deterministic (path-sorted) order before commands and scripts so registration
 * and error reporting are reproducible. A module failing to load, or a
 * conflicting registration, is fatal — we surface it rather than continue with a
 * partial registry.
 */
export async function loadGamePlugins(): Promise<AnyGamePlugin[]> {
	const glob = new Bun.Glob("plugins/**/*.game.ts");
	const paths = Array.from(glob.scanSync(process.cwd())).sort();
	const loaded: AnyGamePlugin[] = [];
	for (const path of paths) {
		const mod = (await import(safeJoin(process.cwd(), path))) as {
			default?: AnyGamePlugin;
		};
		if (!mod.default) {
			throw new Error(
				`Game plugin module "${path}" has no default export (expected a GamePlugin).`,
			);
		}
		registerGamePlugin(mod.default);
		loaded.push(mod.default);
	}
	return loaded;
}
