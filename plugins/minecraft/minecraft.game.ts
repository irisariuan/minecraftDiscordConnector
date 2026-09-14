import {
	defineGamePlugin,
	type ParsedLogLine,
	type PlayerInfo,
	type ServerCapabilities,
	type ServerLifecycle,
	type ServerRuntimeContext,
	type TerminateOptions,
	type TerminateResult,
} from "../api";
import {
	envMinecraftConfig,
	validateMinecraftConfig,
	type MinecraftConfig,
} from "./config";
import { KNOWN_LOADERS } from "./loader/serverLoader";
import {
	closeIpcListener,
	IPC_ENV_VAR,
	isAttached,
	openIpcListener,
	socketPathFor,
} from "./runtime/ipc";
import { parseMinecraftOutput } from "./runtime/parser";
import {
	cancelServerSideShutdown,
	fetchOnlinePlayers,
	getLogs,
	hasServerSideShutdown,
	runCommandOnServer,
	scheduleServerShutdown,
} from "./runtime/request";

type Ctx = ServerRuntimeContext<MinecraftConfig>;

/** Read the validated Minecraft config from a runtime context. */
function mc(ctx: ServerRuntimeContext): MinecraftConfig {
	return ctx.config as unknown as MinecraftConfig;
}

// ─── Lifecycle overrides ───────────────────────────────────────────────────────

const lifecycle: Partial<ServerLifecycle> = {
	parseOutput(line: string): ParsedLogLine {
		return parseMinecraftOutput(line);
	},

	/**
	 * Open the server's IPC socket before starting it, and tell the connector
	 * plugin where to find it. The plugin dials in once the JVM is up.
	 */
	async launch(ctx: ServerRuntimeContext): Promise<number | null> {
		const socketPath = socketPathFor(
			ctx.generic.serverDir,
			mc(ctx).ipcSocket,
		);
		try {
			await openIpcListener(ctx.serverId, socketPath);
		} catch (err) {
			// A server without the connector plugin still runs; it just loses
			// the capabilities that need it.
			console.error(
				`[minecraft] failed to open the IPC socket for server #${ctx.serverId}:`,
				err,
			);
		}
		return ctx.process.spawn(ctx.generic.startCommand, {
			cwd: ctx.generic.serverDir,
			env: { [IPC_ENV_VAR]: socketPath },
		});
	},

	/** Tear the socket down once the process is gone. */
	cleanup(ctx: ServerRuntimeContext): void {
		closeIpcListener(ctx.serverId).catch((err) =>
			console.error(
				`[minecraft] failed to close the IPC socket for server #${ctx.serverId}:`,
				err,
			),
		);
	},

	async terminate(
		ctx: ServerRuntimeContext,
		options: TerminateOptions,
	): Promise<TerminateResult> {
		const grace = Math.max(0, options.grace ?? 0) * 20; // minecraft plugin uses ticks (20 ticks = 1 second)

		// No connector plugin attached: generic timeout → force-kill.
		if (!isAttached(ctx.serverId)) {
			if (grace <= 0) {
				return { success: await ctx.process.kill("SIGKILL") };
			}
			return {
				success: true,
				promise: new Promise<void>((resolve) => {
					setTimeout(async () => {
						if (await ctx.process.isOnline(true)) {
							await ctx.process.kill("SIGKILL");
						}
						resolve();
					}, grace);
				}),
			};
		}

		// Ask the server to shut down after `grace` ticks.
		const scheduled = await scheduleServerShutdown(ctx.serverId, grace);
		if (!scheduled) return { success: false };
		if (grace <= 0) return { success: true };

		// Force-kill fallback if the graceful shutdown overruns.
		const ms = (grace / 20) * 1000 + 3000;
		return {
			success: true,
			promise: new Promise<void>((resolve) => {
				setTimeout(async () => {
					if (await ctx.process.isOnline(true)) {
						await ctx.process.kill();
					}
					resolve();
				}, ms);
			}),
		};
	},
};

// ─── Capabilities ──────────────────────────────────────────────────────────────

const capabilities: ServerCapabilities = {
	async runCommand(ctx: ServerRuntimeContext, command: string) {
		const { success, output } = await runCommandOnServer(
			ctx.serverId,
			command,
		);
		return { success, output };
	},

	async listPlayers(ctx: ServerRuntimeContext): Promise<PlayerInfo[] | null> {
		const players = await fetchOnlinePlayers(ctx.serverId);
		return players?.map((p) => ({ name: p.name, id: p.uuid })) ?? null;
	},

	async getLogs(ctx: ServerRuntimeContext): Promise<ParsedLogLine[] | null> {
		return await getLogs(ctx.serverId);
	},

	async hasScheduledShutdown(ctx: ServerRuntimeContext) {
		return await hasServerSideShutdown(ctx.serverId);
	},

	async cancelScheduledShutdown(ctx: ServerRuntimeContext) {
		return await cancelServerSideShutdown(ctx.serverId);
	},

	// Marker capabilities: the plugin's own commands/routes do the work.
	managePackages: true,
	enforceSessionPayment: true,
};

// ─── Plugin definition ─────────────────────────────────────────────────────────

export default defineGamePlugin<MinecraftConfig>({
	id: "minecraft",
	displayName: "Minecraft",
	runtimeIds: KNOWN_LOADERS,
	validateConfig: validateMinecraftConfig,
	defaultConfig: () => {
		const env = envMinecraftConfig();
		if (env) return env;
		return {
			loaderType: "paper",
			modType: "plugin",
			minecraftVersion: "",
			pluginDir: "",
			ipcSocket: null,
			proxy: {
				enabled: true,
				host: "127.0.0.1",
				forwarding: "none" as const,
				forwardingSecret: null,
			},
		};
	},
	lifecycle: lifecycle as Partial<ServerLifecycle<MinecraftConfig>>,
	capabilities:
		capabilities as unknown as ServerCapabilities<MinecraftConfig>,
	// Backward-compatible: create a default MC server from the legacy env vars
	// when the database is empty. Returns null on a fresh multi-game install.
	bootstrap: () => {
		const config = envMinecraftConfig();
		const serverDir = process.env.SERVER_DIR;
		if (!config || !serverDir) return null;
		return {
			path: serverDir,
			port: [Number(process.env.SERVER_PORT ?? "25565")],
			tag: process.env.SERVER_TAG ?? "Default Server",
			runtimeVersion: config.minecraftVersion,
			config: config as unknown as Record<string, unknown>,
		};
	},
});

// Referenced so `Ctx` is exported-usable by sibling command modules.
export type { Ctx as MinecraftContext };
