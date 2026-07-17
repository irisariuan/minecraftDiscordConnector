/**
 * Core-owned, game-agnostic plugin extension contracts.
 *
 * A **game plugin** teaches the core how to run and talk to one kind of server
 * (Minecraft, and future games). The core provides generic process handling and
 * a registry; a game plugin plugs in game-specific lifecycle overrides and
 * capabilities without importing any `lib/**` internals — everything it needs is
 * handed to it through {@link ServerRuntimeContext}.
 *
 * This module contains TYPES ONLY (plus small helpers). It must stay free of
 * Minecraft or any other game-specific assumptions.
 */

// ─── Log representation ────────────────────────────────────────────────────────

/** Generic severity of a parsed console/log line. */
export type LogLevel = "info" | "warn" | "error" | "unknown";

/** A single line of server console output, normalised for display/pagination. */
export interface ParsedLogLine {
	/** Source timestamp if the plugin could extract one, else null. */
	timestamp: string | null;
	type: LogLevel;
	message: string;
}

/** Passthrough parser used when a plugin provides no {@link ServerLifecycle.parseOutput}. */
export function defaultParseOutput(line: string): ParsedLogLine {
	return { timestamp: null, type: "unknown", message: line };
}

// ─── Generic server metadata ───────────────────────────────────────────────────

/**
 * Game-agnostic server fields the core always knows about. Anything
 * game-specific (loader, mod type, api port, …) lives in the plugin's own
 * validated {@link ServerRuntimeContext.config} JSON instead.
 */
export interface GenericServerConfig {
	serverDir: string;
	/** Listening port(s); used for generic port-conflict checks. */
	port: number[];
	/** Command to launch the process, e.g. `["sh", "./start.sh"]`. */
	startCommand: string[];
	tag: string | null;
}

/** A player/participant on a running server, in generic terms. */
export interface PlayerInfo {
	/** Display name. */
	name: string;
	/** Stable external identifier (e.g. a UUID), if the game has one. */
	id: string;
}

// ─── Plugin-facing state store ────────────────────────────────────────────────

/** Namespaced, persistent key/value store handed to a plugin at runtime. */
export interface PluginStateStore {
	get<T>(key: string): Promise<T | null>;
	getAll<T = unknown>(): Promise<Record<string, T>>;
	set<T>(key: string, value: T): Promise<void>;
	delete(key: string): Promise<void>;
}

// ─── Process handle exposed to plugins ─────────────────────────────────────────

/**
 * A thin, core-implemented handle over the server's OS process. Given to plugin
 * lifecycle/capability hooks so they never touch `Bun.spawn` or core internals
 * directly.
 */
export interface ServerProcessHandle {
	/**
	 * Spawn the process. Core wires stdout through the active
	 * {@link ServerLifecycle.parseOutput} and flips the online flag. Returns the
	 * pid, or null if already running.
	 */
	spawn(command: string[], options?: { cwd?: string }): Promise<number | null>;
	/** Force-kill the process. Resolves true if a running process was killed. */
	kill(signal?: number | NodeJS.Signals): Promise<boolean>;
	/** Current liveness (cached). */
	isOnline(useFresh?: boolean): Promise<boolean>;
	/** Write a single line to the process stdin (generic console passthrough). */
	sendConsoleInput(line: string): boolean;
	/** Append a parsed line to the server's in-memory log buffer. */
	pushLine(line: ParsedLogLine): void;
	/** Subscribe to raw stdout chunks. */
	onOutput(listener: (chunk: string) => void): void;
	/** Snapshot of buffered log lines. */
	getOutputLines(): ParsedLogLine[];
}

/**
 * Everything a plugin lifecycle/capability hook is allowed to see and do.
 * This is the core↔plugin boundary object.
 */
export interface ServerRuntimeContext<Config = Record<string, unknown>> {
	serverId: number;
	generic: GenericServerConfig;
	/** The plugin's own validated configuration for this server. */
	config: Config;
	process: ServerProcessHandle;
	/** Persistent state store, namespaced to the owning plugin. */
	store: PluginStateStore;
}

// ─── Lifecycle overrides ───────────────────────────────────────────────────────

export interface TerminateOptions {
	/**
	 * Optional grace hint. Games interpret this differently (Minecraft treats it
	 * as ticks); a value <= 0 means "stop immediately".
	 */
	grace?: number;
}

export interface TerminateResult {
	success: boolean;
	/** Resolves when the process has actually exited, when known. */
	promise?: Promise<unknown>;
}

/**
 * Overridable process-lifecycle hooks for a server type. Every hook is optional;
 * the core supplies a generic default for each (see `lib/server.ts`).
 */
export interface ServerLifecycle<Config = Record<string, unknown>> {
	/** Start the server. Default: spawn `generic.startCommand` in `serverDir`. */
	launch(ctx: ServerRuntimeContext<Config>): Promise<number | null>;
	/** Gracefully stop. Default: wait `grace`, then force-kill. */
	terminate(
		ctx: ServerRuntimeContext<Config>,
		options: TerminateOptions,
	): Promise<TerminateResult>;
	/** Force stop. Default: `process.kill()`. */
	forceTerminate(
		ctx: ServerRuntimeContext<Config>,
		signal?: number | NodeJS.Signals,
	): Promise<boolean>;
	/** Liveness probe. Default: process exit code is null. */
	probeStatus(ctx: ServerRuntimeContext<Config>): Promise<boolean>;
	/** Parse one stdout line. Default: {@link defaultParseOutput}. */
	parseOutput(line: string): ParsedLogLine;
	/** Release resources after exit. Default: reset buffers/flags. */
	cleanup(ctx: ServerRuntimeContext<Config>): void;
}

// ─── Optional capabilities ─────────────────────────────────────────────────────

/**
 * Optional, capability-gated behaviours a game plugin may implement. A command
 * (in core or in a plugin) declares the capabilities it needs; the core refuses
 * to run it against a server whose plugin does not provide them, with an
 * actionable error rather than a silent fallback.
 *
 * Presence of a key = capability is supported. Absence = not supported.
 */
export interface ServerCapabilities<Config = Record<string, unknown>> {
	/** Execute an in-game/console command and return its output. */
	runCommand?(
		ctx: ServerRuntimeContext<Config>,
		command: string,
	): Promise<{ success: boolean; output: string | null }>;
	/** List currently-connected players. */
	listPlayers?(
		ctx: ServerRuntimeContext<Config>,
	): Promise<PlayerInfo[] | null>;
	/** Fetch recent server-side logs (distinct from the local stdout buffer). */
	getLogs?(ctx: ServerRuntimeContext<Config>): Promise<ParsedLogLine[] | null>;
	/** Whether the server has a server-side scheduled shutdown pending. */
	hasScheduledShutdown?(ctx: ServerRuntimeContext<Config>): Promise<boolean>;
	/** Cancel a server-side scheduled shutdown. */
	cancelScheduledShutdown?(
		ctx: ServerRuntimeContext<Config>,
	): Promise<boolean>;
	/** Link an external game identity to a Discord user (e.g. via OTP). */
	linkIdentity?(
		ctx: ServerRuntimeContext<Config>,
		params: { discordId: string; identifier: string },
	): Promise<{ externalId: string } | null>;
	/** Remove an external identity link. */
	unlinkIdentity?(
		ctx: ServerRuntimeContext<Config>,
		params: { externalId: string },
	): Promise<boolean>;
	/**
	 * The plugin manages installable packages/mods for this server type
	 * (marker capability; the plugin's own commands do the work).
	 */
	managePackages?: true;
	/**
	 * The plugin enforces per-session payment on the server side
	 * (marker capability; enforcement runs inside the plugin's callback routes).
	 */
	enforceSessionPayment?: true;
}

/** Names of capabilities, used by commands to declare requirements. */
export type CapabilityName = keyof ServerCapabilities;

// ─── Config validation ─────────────────────────────────────────────────────────

export type ConfigValidation<Config> =
	| { ok: true; config: Config }
	| { ok: false; error: string };

// ─── The game plugin itself ────────────────────────────────────────────────────

/**
 * A game plugin: the unit registered via a `*.game.ts` module's default export.
 */
export interface GamePlugin<Config = Record<string, unknown>> {
	/** Unique, stable id (e.g. "minecraft"). Duplicate ids are rejected. */
	id: string;
	displayName: string;
	/**
	 * Runtime/loader identifiers this plugin claims (e.g. paper, fabric,
	 * vanilla). Used to route a server to a plugin and to reject conflicts.
	 */
	runtimeIds: string[];
	/** Validate + normalise a server's raw config JSON at the plugin boundary. */
	validateConfig(raw: unknown): ConfigValidation<Config>;
	/** Default config for a newly-created server of this type. */
	defaultConfig?(): Config;
	/** Lifecycle overrides; any omitted hook uses the core default. */
	lifecycle?: Partial<ServerLifecycle<Config>>;
	/** Optional capabilities. */
	capabilities?: ServerCapabilities<Config>;
}

/** Identity helper so plugin authors get full type-checking on their export. */
export function defineGamePlugin<Config>(
	plugin: GamePlugin<Config>,
): GamePlugin<Config> {
	return plugin;
}
