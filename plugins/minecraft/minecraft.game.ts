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

	async terminate(
		ctx: ServerRuntimeContext,
		options: TerminateOptions,
	): Promise<TerminateResult> {
		const { apiPort } = mc(ctx);
		const grace = Math.max(0, options.grace ?? 0);

		// No connector API: generic timeout → force-kill.
		if (apiPort === null) {
			if (grace <= 0) {
				return { success: await ctx.process.kill(0) };
			}
			return {
				success: true,
				promise: new Promise<void>((resolve) => {
					setTimeout(async () => {
						if (await ctx.process.isOnline(true)) {
							await ctx.process.kill(0);
						}
						resolve();
					}, grace);
				}),
			};
		}

		// Ask the server to shut down after `grace` ticks.
		const scheduled = await scheduleServerShutdown(apiPort, grace);
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
		const { apiPort } = mc(ctx);
		if (apiPort === null) return { success: false, output: null };
		const { success, output } = await runCommandOnServer(apiPort, command);
		return { success, output };
	},

	async listPlayers(ctx: ServerRuntimeContext): Promise<PlayerInfo[] | null> {
		const { apiPort } = mc(ctx);
		if (apiPort === null) return null;
		const players = await fetchOnlinePlayers(apiPort);
		return players?.map((p) => ({ name: p.name, id: p.uuid })) ?? null;
	},

	async getLogs(ctx: ServerRuntimeContext): Promise<ParsedLogLine[] | null> {
		const { apiPort } = mc(ctx);
		if (apiPort === null) return null;
		const logs = await getLogs(apiPort);
		return logs;
	},

	async hasScheduledShutdown(ctx: ServerRuntimeContext) {
		const { apiPort } = mc(ctx);
		return apiPort === null ? false : hasServerSideShutdown(apiPort);
	},

	async cancelScheduledShutdown(ctx: ServerRuntimeContext) {
		const { apiPort } = mc(ctx);
		return apiPort === null ? false : cancelServerSideShutdown(apiPort);
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
			apiPort: null,
		};
	},
	lifecycle: lifecycle as Partial<ServerLifecycle<MinecraftConfig>>,
	capabilities: capabilities as unknown as ServerCapabilities<MinecraftConfig>,
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
