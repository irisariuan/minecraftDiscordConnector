import { spawn, type Subprocess } from "bun";
import {
	channelMention,
	time,
	userMention,
	type Client,
	type Message,
} from "discord.js";
import { EventEmitter } from "node:events";
import {
	ApprovalStatus,
	buildChannelFetcher,
	checkApprovalStatus,
	sendApprovalPoll,
	type Approval,
} from "./approval";
import { CacheItem } from "./cache";
import { changeCredit, sendCreditNotification, spendCredit } from "./credit";
import { getAllServers, getUserAccessibleServerIds } from "./db";
import { appEvents } from "./events/appEvents";
import {
	defaultParseOutput,
	type CapabilityName,
	type GenericServerConfig,
	type ParsedLogLine,
	type PluginStateStore,
	type ServerLifecycle,
	type ServerRuntimeContext,
	type TerminateOptions,
	type TerminateResult,
} from "./plugin/contract";
import {
	comparePermission,
	getUsersWithMatchedPermission,
	PermissionFlags,
	readPermission,
} from "./permission";
import {
	requireGamePlugin,
	type RegisteredGamePlugin,
} from "./plugin/registry";
import {
	storeDelete,
	storeGet,
	storeGetAll,
	storeSet,
} from "./pluginStore";
import { loadServerSettings, type ServerSettings } from "./settings";
import { SuspendingEventEmitter } from "./suspend";
import { TicketEffectType, voteApprovalTicketEffects } from "./ticket";
import {
	createDecodeWritableStream,
	isTrueValue,
	sendMessagesToUsersById,
} from "./utils";
import { defaultSettings } from "../defaultSettings";

// ─── Generic server message stream ─────────────────────────────────────────────

class ServerMessageEmitter extends EventEmitter {
	emitMessage(message: string) {
		this.emit("message", message);
	}
	onMessage(listener: (message: string) => void) {
		this.on("message", listener);
	}
	onceMessage(listener: (message: string) => void) {
		this.once("message", listener);
	}
	removeMessageListener(listener: (message: string) => void) {
		this.off("message", listener);
	}
}

interface CreateServerOptions {
	shutdownAllowedTime?: number;
	defaultSuspending?: boolean;
	/** Generic, game-agnostic runtime config. */
	config: GenericServerConfig;
	serverId: number;
	settings: Partial<ServerSettings>;
	/** The game plugin that owns this server. */
	pluginId: string;
	/** Plugin-specific configuration (validated lazily by the plugin). */
	pluginConfig: unknown;
}

/**
 * A game-neutral wrapper around one managed server process.
 *
 * The core owns generic process handling (spawn, force-kill, status, stdout
 * capture, console input, cleanup). Everything game-specific — how to launch,
 * how to gracefully stop, how to parse output, plus optional capabilities like
 * running in-game commands — is delegated to the server's {@link GamePlugin}
 * through {@link ServerLifecycle}/`ServerCapabilities`, with core defaults used
 * for any hook a plugin does not override.
 */
export class Server {
	private instance: Subprocess<"pipe", "pipe", "inherit"> | null;
	private waitingToShutdown: boolean;
	private manager: ServerManager | null = null;
	private resolvedPlugin: RegisteredGamePlugin | null = null;
	private validatedConfig: Record<string, unknown> | null = null;
	private readonly rawConfig: unknown;

	isOnline: CacheItem<boolean>;
	serverMessageEmitter: ServerMessageEmitter;
	outputLines: ParsedLogLine[];
	shutdownAllowedTime: number;
	timeouts: NodeJS.Timeout[];
	suspendingEvent: SuspendingEventEmitter;
	approvalList: Map<string, Approval>;
	settings: ServerSettings;
	readonly config: GenericServerConfig;
	readonly pluginId: string;
	readonly id: number;

	constructor({
		shutdownAllowedTime,
		defaultSuspending = isTrueValue(process.env.DEFAULT_SUSPENDING || "") ??
			false,
		serverId,
		config,
		settings,
		pluginId,
		pluginConfig,
	}: CreateServerOptions) {
		this.instance = null;
		this.outputLines = [];
		this.timeouts = [];
		this.approvalList = new Map();
		this.config = config;
		this.pluginId = pluginId;
		this.rawConfig = pluginConfig;
		this.id = serverId;
		this.settings = { ...defaultSettings, ...settings };
		this.serverMessageEmitter = new ServerMessageEmitter();
		this.suspendingEvent = new SuspendingEventEmitter(defaultSuspending);
		this.isOnline = new CacheItem<boolean>(false, {
			interval: 1000 * 5,
			ttl: 1000 * 5,
			updateMethod: async () => this.instance?.exitCode === null,
		});
		this.waitingToShutdown = false;
		this.shutdownAllowedTime = shutdownAllowedTime ?? 3000;
	}

	attachManager(manager: ServerManager) {
		this.manager = manager;
	}

	// ── Plugin resolution ────────────────────────────────────────────────────

	/** Resolve (and cache) the owning game plugin, throwing if it is missing. */
	private plugin(): RegisteredGamePlugin {
		return (this.resolvedPlugin ??= requireGamePlugin(
			this.pluginId,
			this.id,
		));
	}

	/** Validate + cache this server's plugin config at the plugin boundary. */
	private pluginConfig(): Record<string, unknown> {
		if (this.validatedConfig) return this.validatedConfig;
		const result = this.plugin().validateConfig(this.rawConfig);
		if (!result.ok) {
			throw new Error(
				`Invalid configuration for server #${this.id} (plugin "${this.pluginId}"): ${result.error}`,
			);
		}
		return (this.validatedConfig = result.config as Record<
			string,
			unknown
		>);
	}

	/** The effective lifecycle: core defaults overlaid with plugin overrides. */
	private lifecycle(): ServerLifecycle {
		return { ...this.coreDefaults(), ...(this.plugin().lifecycle ?? {}) };
	}

	private context(): ServerRuntimeContext {
		return {
			serverId: this.id,
			generic: this.config,
			config: this.pluginConfig(),
			process: this.processHandle(),
			store: this.storeHandle(),
		};
	}

	/** True when the owning plugin declares the named capability. */
	hasCapability(name: CapabilityName): boolean {
		return Boolean(this.plugin().capabilities?.[name]);
	}

	/** The validated plugin config (for read-only inspection by callers). */
	getPluginConfig(): Record<string, unknown> {
		return this.pluginConfig();
	}

	// ── Generic process handle handed to plugin hooks ────────────────────────

	private processHandle() {
		return {
			spawn: (command: string[], options?: { cwd?: string }) =>
				this.doSpawn(command, options),
			kill: (signal?: number | NodeJS.Signals) => this.forceStop(signal),
			isOnline: async (useFresh?: boolean) =>
				(await this.isOnline.getData(useFresh)) ?? false,
			sendConsoleInput: (line: string) => this.sendConsoleInput(line),
			pushLine: (line: ParsedLogLine) => {
				this.outputLines.push(line);
			},
			onOutput: (listener: (chunk: string) => void) =>
				this.serverMessageEmitter.onMessage(listener),
			getOutputLines: () => this.outputLines,
		};
	}

	private storeHandle(): PluginStateStore {
		const ns = this.pluginId;
		return {
			get: <T>(key: string) => storeGet(ns, key) as Promise<T | null>,
			getAll: <T = unknown>() =>
				storeGetAll(ns) as Promise<Record<string, T>>,
			set: <T>(key: string, value: T) => storeSet(ns, key, value),
			delete: (key: string) => storeDelete(ns, key),
		};
	}

	// ── Generic output capture ───────────────────────────────────────────────

	captureNextLineOfOutput() {
		if (!this.instance) return null;
		return new Promise<string>((r) => {
			this.serverMessageEmitter.onceMessage((message) => r(message));
		});
	}

	captureLastLineOfOutput() {
		if (!this.instance) return null;
		return this.outputLines.at(-1) ?? null;
	}

	captureSomeOutput(ms: number, maxLines = -1) {
		if (!this.instance) return null;
		return new Promise<string[]>((r) => {
			const timeout = setTimeout(() => {
				this.serverMessageEmitter.removeMessageListener(listener);
				r(result);
			}, ms);
			const result: string[] = [];
			const listener = (message: string) => {
				result.push(message);
				if (maxLines > 0 && result.length >= maxLines) {
					this.serverMessageEmitter.removeMessageListener(listener);
					clearTimeout(timeout);
					r(result);
				}
			};
			this.serverMessageEmitter.onMessage(listener);
		});
	}

	/** Write one line to the process stdin (generic console passthrough). */
	sendConsoleInput(line: string): boolean {
		const inst = this.instance;
		if (!inst || inst.exitCode !== null) return false;
		inst.stdin.write(line.endsWith("\n") ? line : `${line}\n`);
		inst.stdin.flush();
		return true;
	}

	// ── Public lifecycle (delegates to the plugin, falls back to defaults) ────

	async start(manager: ServerManager): Promise<number | null> {
		this.manager = manager;
		if (this.instance || (await this.isOnline.getData(true))) return null;
		return this.lifecycle().launch(this.context());
	}

	async stop(options: TerminateOptions = {}): Promise<TerminateResult> {
		return this.lifecycle().terminate(this.context(), options);
	}

	async forceStop(
		signal: number | NodeJS.Signals = "SIGKILL",
	): Promise<boolean> {
		if (this.instance?.exitCode === null) {
			this.instance?.kill(signal);
			await this.instance?.exited;
			this.waitingToShutdown = false;
			return true;
		}
		return false;
	}

	async raceShutdown(ms: number) {
		const promise = new Promise<void>((r) => {
			const timeout = setTimeout(async () => {
				if (await this.forceStop()) {
					console.log("Server process forcefully stopped");
				}
				const index = this.timeouts.findIndex((t) => t === timeout);
				if (index !== -1) this.timeouts.splice(index, 1);
				r();
			}, ms);
			this.timeouts.push(timeout);
		});
		return Promise.race([promise, this.instance?.exited]);
	}

	haveLocalSideScheduledShutdown() {
		return this.timeouts.length > 0;
	}

	cancelLocalScheduledShutdown() {
		this.waitingToShutdown = false;
		for (const timeout of this.timeouts) clearTimeout(timeout);
		this.timeouts = [];
	}

	/** Whether the owning plugin reports a server-side scheduled shutdown. */
	async hasScheduledShutdown(): Promise<boolean> {
		const cap = this.plugin().capabilities?.hasScheduledShutdown;
		return cap ? cap(this.context()) : false;
	}

	/** Ask the owning plugin to cancel a server-side scheduled shutdown. */
	async cancelScheduledShutdown(): Promise<boolean> {
		const cap = this.plugin().capabilities?.cancelScheduledShutdown;
		return cap ? cap(this.context()) : false;
	}

	cleanup() {
		console.log(`Cleaning up server process #${this.id}`);
		this.instance = null;
		this.isOnline.setData(false);
		this.waitingToShutdown = false;
		this.outputLines = [];
		try {
			this.lifecycle().cleanup(this.context());
		} catch (err) {
			console.error(`Plugin cleanup failed for server #${this.id}:`, err);
		}
	}

	// ── Core default lifecycle implementations ────────────────────────────────

	private coreDefaults(): ServerLifecycle {
		return {
			launch: (ctx) =>
				ctx.process.spawn(ctx.generic.startCommand, {
					cwd: ctx.generic.serverDir,
				}),
			terminate: (_ctx, options) => this.defaultTerminate(options),
			forceTerminate: (_ctx, signal) => this.forceStop(signal),
			probeStatus: () =>
				Promise.resolve(this.instance?.exitCode === null),
			parseOutput: defaultParseOutput,
			cleanup: () => {},
		};
	}

	private async defaultTerminate(
		options: TerminateOptions,
	): Promise<TerminateResult> {
		if (this.waitingToShutdown || !(await this.isOnline.getData(true))) {
			return { success: false };
		}
		this.waitingToShutdown = true;
		const graceMs = Math.max(0, options.grace ?? 0);
		if (graceMs <= 0) {
			const stopped = await this.forceStop("SIGKILL");
			this.waitingToShutdown = false;
			return { success: stopped, promise: this.instance?.exited };
		}
		return {
			success: true,
			promise: new Promise<void>((r) => {
				const timeout = setTimeout(async () => {
					if (
						this.waitingToShutdown &&
						this.instance?.exitCode === null &&
						(await this.forceStop("SIGKILL"))
					) {
						console.log("Server process forcefully stopped");
					}
					this.waitingToShutdown = false;
					r();
				}, graceMs);
				this.timeouts.push(timeout);
			}),
		};
	}

	/** Spawn the process and wire generic stdout capture through the plugin's parser. */
	private async doSpawn(
		command: string[],
		options?: { cwd?: string },
	): Promise<number | null> {
		if (this.instance || (await this.isOnline.getData(true))) return null;
		const parseOutput = this.lifecycle().parseOutput;
		const instance = spawn(command, {
			cwd: options?.cwd ?? this.config.serverDir,
			stdin: "pipe",
			stdout: "pipe",
			onExit: (_subprocess, exitCode, signalCode, error) => {
				console.log(
					`Server #${this.id} process exited with code ${exitCode} and signal ${signalCode}`,
				);
				if (error) console.error(`Error: ${error}`);
				this.cleanup();
			},
		}) as unknown as Subprocess<"pipe", "pipe", "inherit">;
		this.instance = instance;
		this.isOnline.setData(true);
		this.manager?.checkServerStatus();

		instance.stdout.pipeTo(
			createDecodeWritableStream((chunk) => {
				console.log(`[server:${this.pluginId}#${this.id}] ${chunk}`);
				this.serverMessageEmitter.emitMessage(chunk);
				this.outputLines.push(parseOutput(chunk));
			}),
		);
		instance.exited.then(() => this.manager?.checkServerStatus());
		return instance.pid;
	}
}

export async function createServerManager(client: Client) {
	const manager = new ServerManager(client);
	await manager.loadServers();
	registerServerRuntimeHandlers(manager, client);
	return manager;
}

/**
 * Call `createServerManager` to create instance, **DO NOT** create it directly.
 */
export class ServerManager {
	private servers: Map<number, Server>;
	private anyOnline = false;

	constructor(_client: Client) {
		this.servers = new Map();
	}

	async loadServers() {
		this.servers.clear();
		for (const server of await getAllServers()) {
			this.servers.set(server.id, this.buildServer(server));
		}
		return this.servers;
	}

	private buildServer(server: Awaited<ReturnType<typeof getAllServers>>[number]) {
		const instance = new Server({
			serverId: server.id,
			config: {
				serverDir: server.path,
				port: server.port,
				startCommand: ["sh", server.startupScript ?? "./start.sh"],
				tag: server.tag,
			},
			settings: {},
			pluginId: server.pluginId,
			pluginConfig: server.config,
		});
		instance.attachManager(this);
		// Load per-server settings asynchronously; falls back to defaults meanwhile.
		loadServerSettings(server.id)
			.then((settings) => {
				instance.settings = { ...instance.settings, ...settings };
			})
			.catch((err) =>
				console.error(
					`Failed to load settings for server #${server.id}:`,
					err,
				),
			);
		return instance;
	}

	getServer(serverId: number) {
		return this.servers.get(serverId);
	}
	getAllServerEntries() {
		return Array.from(this.servers.entries());
	}
	getAllServers() {
		return Array.from(this.servers.values());
	}

	getAllTagPairs() {
		const result: TagPair[] = [];
		for (const [id, server] of this.servers.entries()) {
			result.push({
				id,
				tag: server.config.tag,
				pluginId: server.pluginId,
			});
		}
		return result;
	}
	getServerCount() {
		return this.servers.size;
	}

	async getAccessibleServerEntries(userId: string): Promise<[number, Server][]> {
		const ids = await getUserAccessibleServerIds(userId);
		if (ids === null) return this.getAllServerEntries();
		return this.getAllServerEntries().filter(([id]) => ids.includes(id));
	}

	async getAccessibleTagPairs(userId: string): Promise<TagPair[]> {
		const ids = await getUserAccessibleServerIds(userId);
		if (ids === null) return this.getAllTagPairs();
		return this.getAllTagPairs().filter((p) => ids.includes(p.id));
	}

	async getAccessibleServerCount(userId: string): Promise<number> {
		const ids = await getUserAccessibleServerIds(userId);
		if (ids === null) return this.getServerCount();
		return this.getAllServerEntries().filter(([id]) => ids.includes(id))
			.length;
	}

	async getAllUsingPorts() {
		const ports: number[] = [];
		for (const server of this.servers.values()) {
			if (await server.isOnline.getData(true)) {
				ports.push(...server.config.port);
			}
		}
		return ports;
	}

	async addOrReloadServer(serverData: {
		id: number;
		port: number[];
		path: string;
		startupScript: string | null;
		tag: string | null;
		pluginId: string;
		config: unknown;
	}): Promise<"full" | "partial"> {
		const existingServer = this.servers.get(serverData.id);
		const isRunning =
			existingServer && (await existingServer.isOnline.getData(true));

		if (isRunning) {
			// Partial in-memory update for a live server (config is readonly ref
			// but the object itself is mutable).
			(existingServer.config as GenericServerConfig).tag = serverData.tag;
			return "partial";
		}

		const newServer = new Server({
			serverId: serverData.id,
			config: {
				serverDir: serverData.path,
				port: serverData.port,
				startCommand: ["sh", serverData.startupScript ?? "./start.sh"],
				tag: serverData.tag,
			},
			settings: await loadServerSettings(serverData.id),
			pluginId: serverData.pluginId,
			pluginConfig: serverData.config,
		});
		newServer.attachManager(this);
		this.servers.set(serverData.id, newServer);
		return "full";
	}

	removeServer(serverId: number) {
		this.servers.delete(serverId);
	}

	async exitAllServers(client: Client) {
		for (const server of this.servers.values()) {
			await exitServer(client, server);
		}
	}

	async getActiveServerFromPort(port: number) {
		for (const server of this.servers.values()) {
			if (
				server.config.port.includes(port) &&
				(await server.isOnline.getData())
			) {
				return server;
			}
		}
		return null;
	}

	/** Recompute the "any server online" flag and emit on transition. */
	async checkServerStatus() {
		let anyOnline = false;
		for (const server of this.servers.values()) {
			if (await server.isOnline.getData(true)) {
				anyOnline = true;
				break;
			}
		}
		if (anyOnline !== this.anyOnline) {
			this.anyOnline = anyOnline;
			appEvents.emit("serverStatusChanged", { anyOnline });
		}
	}
}

/** The still-open "start this server" approval poll on a server, if any. */
function findPendingStartPoll(server: Server): Approval | null {
	for (const approval of server.approvalList.values()) {
		if (approval.options.kind !== "startServer") continue;
		if (checkApprovalStatus(approval) !== ApprovalStatus.Pending) continue;
		return approval;
	}
	return null;
}

/** Best-effort jump link to an approval poll's message. */
function approvalUrl(approval: Approval): string | null {
	try {
		return approval.message.url ?? null;
	} catch {
		return null;
	}
}

/** Register runtime data channels that need a live {@link ServerManager}/client. */
function registerServerRuntimeHandlers(manager: ServerManager, client: Client) {
	appEvents.handle("server:getActiveByPort", async ({ port }) => {
		const server = await manager.getActiveServerFromPort(port);
		if (!server) return null;
		return {
			id: server.id,
			pluginId: server.pluginId,
			tag: server.config.tag,
			config: server.getPluginConfig(),
			settings: server.settings,
		};
	});

	appEvents.handle("server:list", async () => {
		try {
			const result: {
				id: number;
				pluginId: string;
				tag: string | null;
				port: number[];
				online: boolean;
				config: Record<string, unknown>;
				settings: ServerSettings;
			}[] = [];
			for (const server of manager.getAllServers()) {
				let config: Record<string, unknown> = {};
				try {
					config = server.getPluginConfig();
				} catch (err) {
					console.error(
						`Failed to read plugin config for server #${server.id}:`,
						err,
					);
				}
				result.push({
					id: server.id,
					pluginId: server.pluginId,
					tag: server.config.tag,
					port: server.config.port,
					online: (await server.isOnline.getData(true)) ?? false,
					config,
					settings: server.settings,
				});
			}
			return result;
		} catch (err) {
			console.error("server:list failed:", err);
			return [];
		}
	});

	appEvents.handle("server:start", async ({ id }) => {
		try {
			const server = manager.getServer(id);
			if (!server) {
				return {
					started: false,
					pid: null,
					error: `Unknown server #${id}`,
				};
			}
			if (await server.isOnline.getData(true)) {
				return {
					started: false,
					pid: null,
					error: "Server is already online",
				};
			}
			const pid = await server.start(manager);
			if (!pid) {
				return {
					started: false,
					pid: null,
					error: "Server is already online",
				};
			}
			return { started: true, pid };
		} catch (err) {
			console.error(`server:start failed for server #${id}:`, err);
			return {
				started: false,
				pid: null,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	});

	appEvents.handle("server:accessibleIds", async ({ discordId }) => {
		try {
			return await getUserAccessibleServerIds(discordId);
		} catch (err) {
			console.error(
				`server:accessibleIds failed for ${discordId}:`,
				err,
			);
			// Fail closed: grant nothing rather than everything.
			return [];
		}
	});

	appEvents.handle("server:pendingStartPoll", ({ id }) => {
		try {
			const server = manager.getServer(id);
			if (!server) return { pending: false, url: null };
			const approval = findPendingStartPoll(server);
			if (!approval) return { pending: false, url: null };
			return { pending: true, url: approvalUrl(approval) };
		} catch (err) {
			console.error(
				`server:pendingStartPoll failed for server #${id}:`,
				err,
			);
			return { pending: false, url: null };
		}
	});

	appEvents.handle(
		"server:requestStart",
		async ({ id, discordId, channelId, requestedBy }) => {
			try {
				const server = manager.getServer(id);
				if (!server) {
					return {
						status: "failed" as const,
						message: `Unknown server #${id}.`,
					};
				}
				const label = server.config.tag ?? `Server #${server.id}`;
				if (await server.isOnline.getData(true)) {
					return {
						status: "already_online" as const,
						message: `${label} is already online.`,
					};
				}
				for (const port of await manager.getAllUsingPorts()) {
					if (!server.config.port.includes(port)) continue;
					return {
						status: "port_conflict" as const,
						message: `Cannot start ${label} because port ${port} is already in use by another server.`,
					};
				}

				const user = await client.users
					.fetch(discordId)
					.catch(() => null);
				if (!user) {
					return {
						status: "failed" as const,
						message: "Could not resolve the linked Discord account.",
					};
				}

				// Permitted users start the server immediately and for free.
				if (
					comparePermission(
						await readPermission(discordId, server.id),
						PermissionFlags.startServer,
					)
				) {
					const pid = await server.start(manager);
					if (!pid) {
						return {
							status: "already_online" as const,
							message: `${label} is already online.`,
						};
					}
					console.log(`Server started with PID ${pid}`);
					return {
						status: "started" as const,
						message: `${label} is starting now.`,
					};
				}

				const existing = findPendingStartPoll(server);
				if (existing) {
					return {
						status: "poll_pending" as const,
						message: `A vote to start ${label} is already open on Discord.`,
						pollUrl: approvalUrl(existing),
					};
				}

				if (!channelId) {
					return {
						status: "no_channel" as const,
						message: `No vote channel is configured, so no vote could be raised. Use /startserver on Discord to start ${label}.`,
					};
				}
				const channel = await client.channels
					.fetch(channelId)
					.catch(() => null);
				if (!channel?.isSendable()) {
					return {
						status: "no_channel" as const,
						message: `The configured vote channel cannot be posted to. Use /startserver on Discord to start ${label}.`,
					};
				}

				const transaction = await spendCredit({
					user,
					channel,
					cost: server.settings.newStartServerPollFee,
					reason: "New Start Server Poll",
					serverId: server.id,
				});
				if (!transaction) {
					return {
						status: "insufficient_credit" as const,
						message: `You do not have enough credit to open a vote to start ${label}.`,
					};
				}

				let approvalCount = server.settings.startServerApproval;
				const customApprovalTicket = transaction.ticketUsed?.find(
					(t) =>
						t.effect.effect ===
						TicketEffectType.CustomApprovalCount,
				);
				if (
					customApprovalTicket &&
					customApprovalTicket.effect.effect ===
						TicketEffectType.CustomApprovalCount
				) {
					approvalCount = customApprovalTicket.effect.count;
				}
				if (approvalCount === 0) {
					const pid = await server.start(manager);
					if (!pid) {
						return {
							status: "already_online" as const,
							message: `${label} is already online.`,
						};
					}
					console.log(`Server started with PID ${pid}`);
					return {
						status: "started" as const,
						message: `${label} is starting now.`,
					};
				}

				const fetchMessage = buildChannelFetcher(channel);
				const captured: { message: Message | null } = { message: null };
				await sendApprovalPoll(
					async (embed) => {
						const message = await fetchMessage(embed);
						captured.message = message;
						return message;
					},
					{
						content: requestedBy
							? `Start Server at ${label} (requested in game by ${requestedBy})`
							: `Start Server at ${label}`,
						options: {
							async canRepeatApprove({
								user,
								approval,
								server,
							}) {
								if (!approval.options.credit) return false;
								const approvalCount =
									approval.approvalIds.filter(
										(id) => id === user.id,
									).length +
									approval.disapprovalIds.filter(
										(id) => id === user.id,
									).length;
								const transaction = await spendCredit({
									user,
									channel,
									cost: approval.options.credit,
									reason: "Start Server Vote",
									serverId: server.id,
									acceptedTicketTypeIds:
										voteApprovalTicketEffects,
									mustUseTickets: true,
									onBeforeSpend: async ({ tickets }) => {
										if (!tickets) return false;
										return !!tickets.find(
											(t) =>
												t.effect.effect ===
													TicketEffectType.RepeatApprove &&
												t.effect.maxCount >=
													approvalCount + 1, // +1 because the current vote has not been counted in approvalCount yet
										);
									},
								});
								return !!transaction;
							},
							startPollFee:
								server.settings.newStartServerPollFee,
							callerId: discordId,
							kind: "startServer",
							description: `Start Server (${label})`,
							async onSuccess(approval, message) {
								const pid = await server.start(manager);
								if (!pid) {
									await message.reply({
										content: "Server is already online",
									});
									return;
								}
								console.log(`Server started with PID ${pid}`);
								const users =
									await getUsersWithMatchedPermission(
										PermissionFlags.receiveNotification,
									);
								if (users) {
									sendMessagesToUsersById(
										client,
										users,
										`Server started with a vote by ${userMention(discordId)} at ${channelMention(channel.id)} (${time(approval.createdAt)})`,
									);
								}
								await message.reply({
									content: "Server started successfully",
								});
							},
							approvalCount,
							disapprovalCount:
								server.settings.startServerDisapproval,
							credit: server.settings.startServerVoteFee,
						},
						server,
					},
				);

				return {
					status: "poll_created" as const,
					message: `A vote to start ${label} was posted on Discord.`,
					pollUrl: captured.message?.url ?? null,
				};
			} catch (err) {
				console.error(
					`server:requestStart failed for server #${id}:`,
					err,
				);
				return {
					status: "failed" as const,
					message: "An internal error occurred, please try again later.",
				};
			}
		},
	);

	appEvents.handle(
		"credit:charge",
		async ({ discordId, change, reason, serverId, silent = true }) => {
			await changeCredit({ userId: discordId, change, serverId, reason });
			const user = await client.users.fetch(discordId).catch(() => null);
			if (user) {
				await sendCreditNotification({
					user,
					creditChanged: change,
					reason,
					serverId,
					silent,
				});
			}
			return true;
		},
	);
}

export interface TagPair {
	id: number;
	tag: string | null;
	/** The game plugin that owns the server — used to disambiguate selection. */
	pluginId: string;
}

async function exitServer(client: Client, server: Server) {
	const { success, promise } = await server.stop({ grace: 0 });
	if (success) {
		console.log("Server process shutting down");
		await promise;
		console.log("Server process stopped");
	}
	for (const [id, approval] of server.approvalList.entries()) {
		console.log(`Found approval ${id}, trying to clean up...`);
		if (approval.options.startPollFee) {
			console.log(
				`Refund ${approval.options.startPollFee} to caller ${approval.options.callerId}`,
			);
			await changeCredit({
				userId: approval.options.callerId,
				change: approval.options.startPollFee,
				serverId: server.id,
				reason: "New Approval Poll Refund",
			});
			const user = await client.users
				.fetch(approval.options.callerId)
				.catch(() => null);
			if (user) {
				await sendCreditNotification({
					user,
					creditChanged: approval.options.startPollFee,
					reason: "New Approval Poll Refund",
					serverId: server.id,
					silent: true,
				});
			}
		}
		if (approval.options.credit) {
			for (const id of approval.approvalIds.concat(
				approval.disapprovalIds,
			)) {
				await changeCredit({
					userId: id,
					change: approval.options.credit,
					reason: "Approval Reaction Refund",
					serverId: server.id,
				});
				const user = await client.users.fetch(id).catch(() => null);
				if (user) {
					await sendCreditNotification({
						user,
						creditChanged: approval.options.credit,
						reason: "Approval Reaction Refund",
						silent: true,
						serverId: server.id,
					});
				}
			}
		}
		if (approval.message.editable) {
			await approval.message.reactions.removeAll();
			await approval.message.edit({
				content: "Approval Canceled",
				embeds: [],
				components: [],
			});
			continue;
		}
		if (approval.message.deletable) {
			await approval.message.delete();
		}
	}
}
