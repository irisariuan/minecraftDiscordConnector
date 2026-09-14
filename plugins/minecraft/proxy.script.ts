import bodyParser from "body-parser";
import express, {
	type Express,
	type NextFunction,
	type Request,
	type Response,
} from "express";
import { chmodSync } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import type { Server as HttpServer } from "node:http";
import { dirname } from "node:path";
import { connect } from "node:net";
import { z } from "zod";
import { comparePermission, data, PermissionFlags } from "../api";
import {
	getIpcPath,
	getListenPort,
	getMaxPlayers,
	getMotd,
	getProxyBin,
	getPublicHost,
	getVoteChannelId,
	isProxyEnabled,
	listProxiedServers,
} from "./runtime/proxySettings";

const PLUGIN_ID = "minecraft";
const LOG_PREFIX = "[mcproxy]";
/**
 * Mode of the control socket: owner only. The socket is the whole access
 * boundary between the bot and anything else on the machine, so it must not be
 * group- or world-writable.
 */
const CONTROL_SOCKET_MODE = 0o600;
const RESTART_BACKOFF_MIN_MS = 1000;
const RESTART_BACKOFF_MAX_MS = 30_000;
/** A child that survives this long is considered healthy; backoff resets. */
const BACKOFF_RESET_AFTER_MS = 60_000;

const uuidSchema = z.string().min(1).max(64);

const sessionSchema = z.object({
	uuid: uuidSchema,
	name: z.string().min(1).max(64),
	ip: z.string().max(64).optional().default(""),
	protocol: z.number().int().optional().default(0),
});
const startSchema = z.object({
	uuid: uuidSchema,
	name: z.string().min(1).max(64),
	serverId: z.number().int(),
});

/**
 * Messages travel back into the game verbatim, so they must stay plain text:
 * no legacy `§` colour codes and no newlines.
 */
function plainText(message: string): string {
	return message.replace(/§./g, "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

/** Look up the Discord account linked to a Minecraft UUID, or null. */
async function identityOf(uuid: string) {
	try {
        return await data
            .request("identity:getByExternal", {
                pluginId: PLUGIN_ID,
                externalId: uuid,
            });
    } catch {
        return null;
    }
}

/**
 * Build the control API the Go proxy drives, served over a Unix socket. Every endpoint of
 * `plugins/minecraft/proxy/CONTROL_API.md` lives here; the proxy owns no state
 * of its own and asks the bot for every decision.
 */
function createControlApp(token: string): Express {
	const app = express();
	const jsonParser = bodyParser.json();

	app.use((req: Request, res: Response, next: NextFunction) => {
		const header = req.headers.authorization ?? "";
		if (header !== `Bearer ${token}`) {
			res.status(401).json({ error: "unauthorized" });
			return;
		}
		next();
	});

	app.get("/config", async (_req, res) => {
		try {
			const [
				listenPort,
				publicHost,
				maxPlayers,
				motd,
				voteChannelId,
				servers,
			] = await Promise.all([
				getListenPort(),
				getPublicHost(),
				getMaxPlayers(),
				getMotd(),
				getVoteChannelId(),
				listProxiedServers(),
			]);
			res.json({
				listenPort,
				publicHost,
				maxPlayers,
				motd,
				voteChannelConfigured: voteChannelId !== null,
				servers,
			});
		} catch (err) {
			console.error(`${LOG_PREFIX} GET /config failed:`, err);
			res.status(500).json({ error: "internal_error" });
		}
	});

	app.post("/session", jsonParser, async (req, res) => {
		const parsed = sessionSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: "invalid_request" });
			return;
		}
		try {
			const [link, voteChannelId, proxied] = await Promise.all([
				identityOf(parsed.data.uuid),
				getVoteChannelId(),
				listProxiedServers(),
			]);
			const voteChannelConfigured = voteChannelId !== null;

			// An unlinked player is not turned away. Server access and the
			// right to start a server are per-Discord-account, so neither can
			// be resolved for them, but they are still routed and held like
			// anyone else. Linking happens in game through /link, which needs
			// them to be able to get in.
			if (!link) {
				const polls = await Promise.all(
					proxied.map((server) =>
						data.request("server:pendingStartPoll", {
							id: server.id,
						}),
					),
				);
				res.json({
					linked: false,
					voteChannelConfigured,
					servers: proxied.map((server, index) => ({
						id: server.id,
						tag: server.tag,
						online: server.online,
						accessible: true,
						canStart: false,
						pollPending: polls[index]?.pending ?? false,
						pollUrl: polls[index]?.url ?? null,
					})),
				});
				return;
			}

			const accessible = await data.request("server:accessibleIds", {
				discordId: link.discordId,
			});
			const servers = await Promise.all(
				proxied.map(async (server) => {
					const [permission, poll] = await Promise.all([
						data.request("permission:read", {
							user: link.discordId,
							serverId: server.id,
						}),
						data.request("server:pendingStartPoll", {
							id: server.id,
						}),
					]);
					return {
						id: server.id,
						tag: server.tag,
						online: server.online,
						accessible:
							accessible === null ||
							accessible.includes(server.id),
						canStart: comparePermission(
							permission,
							PermissionFlags.startServer,
						),
						pollPending: poll.pending,
						pollUrl: poll.url,
					};
				}),
			);

			res.json({
				linked: true,
				discordId: link.discordId,
				voteChannelConfigured,
				servers,
			});
		} catch (err) {
			console.error(`${LOG_PREFIX} POST /session failed:`, err);
			res.status(500).json({ error: "internal_error" });
		}
	});

	app.post("/start", jsonParser, async (req, res) => {
		const parsed = startSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: "invalid_request" });
			return;
		}
		try {
			const link = await identityOf(parsed.data.uuid);
			if (!link) {
				res.json({
					status: "not_linked",
					message:
						"Your Minecraft account is not linked to Discord yet. Run /link on Discord once you are in game.",
				});
				return;
			}
			const accessible = await data.request("server:accessibleIds", {
				discordId: link.discordId,
			});
			if (accessible !== null && !accessible.includes(parsed.data.serverId)) {
				res.json({
					status: "no_access",
					message: "You are not allowed to use that server.",
				});
				return;
			}
			const result = await data.request("server:requestStart", {
				id: parsed.data.serverId,
				discordId: link.discordId,
				channelId: await getVoteChannelId(),
				requestedBy: parsed.data.name,
			});
			res.json({
				status: result.status,
				message: plainText(result.message),
				pollUrl: result.pollUrl ?? null,
			});
		} catch (err) {
			console.error(`${LOG_PREFIX} POST /start failed:`, err);
			res.json({
				status: "failed",
				message: "The bot could not handle that request, try again later.",
			});
		}
	});

	return app;
}

/** Pipe a child stream into the bot's log, one prefixed line at a time. */
async function pipeToLog(
	stream: ReadableStream<Uint8Array> | null,
	write: (line: string) => void,
) {
	if (!stream) return;
	const decoder = new TextDecoder();
	let buffer = "";
	for await (const chunk of stream) {
		buffer += decoder.decode(chunk, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			if (line.trim()) write(`${LOG_PREFIX} ${line.trimEnd()}`);
		}
	}
	if (buffer.trim()) write(`${LOG_PREFIX} ${buffer.trimEnd()}`);
}


/** Remove the control socket, ignoring the case where it is already gone. */
function removeSocket(path: string) {
	unlink(path).catch(() => {});
}

/**
 * Make `path` usable as a listening socket.
 *
 * A socket file outlives the process that made it, so a crash leaves one behind
 * and the next start fails with EADDRINUSE. Deleting it blindly would be worse:
 * if another bot really is running, that would steal its socket and leave it
 * serving a file nothing can reach. So probe first and only clear the corpse.
 */
async function prepareSocketPath(path: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true }).catch(() => {});

	const exists = await stat(path).then(
		() => true,
		() => false,
	);
	if (!exists) return;

	const live = await new Promise<boolean>((resolve) => {
		const probe = connect(path);
		const settle = (result: boolean) => {
			probe.destroy();
			resolve(result);
		};
		probe.once("connect", () => settle(true));
		probe.once("error", () => settle(false));
		setTimeout(() => settle(false), 1000);
	});

	if (live) {
		throw new Error(
			`${LOG_PREFIX} another process is already serving the control socket at "${path}". ` +
				"Stop it, or point MC_PROXY_IPC_PATH somewhere else.",
		);
	}
	console.log(`${LOG_PREFIX} clearing stale control socket "${path}"`);
	await unlink(path).catch(() => {});
}

/**
 * Supervise the Go proxy child process: spawn it, mirror its output into the
 * bot's log and restart it with exponential backoff until the bot shuts down.
 */
function createSupervisor(ipcPath: string, token: string) {
	let child: Bun.Subprocess<"ignore", "pipe", "pipe"> | null = null;
	let shuttingDown = false;
	let backoffMs = RESTART_BACKOFF_MIN_MS;
	let restartTimer: ReturnType<typeof setTimeout> | null = null;

	async function spawnOnce() {
		if (shuttingDown) return;
		const bin = await getProxyBin();
		if (!(await Bun.file(bin).exists())) {
			console.error(
				`${LOG_PREFIX} proxy binary not found at "${bin}". Run \`bun run build:proxy\` (or set MC_PROXY_BIN) and restart the bot. Not retrying.`,
			);
			return;
		}
		const listenPort = await getListenPort();
		const startedAt = Date.now();
		let spawned: Bun.Subprocess<"ignore", "pipe", "pipe">;
		try {
			spawned = Bun.spawn([bin], {
				env: {
					...process.env,
					MC_PROXY_IPC_PATH: ipcPath,
					MC_PROXY_TOKEN: token,
					MC_PROXY_LISTEN_PORT: String(listenPort),
				},
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			});
		} catch (err) {
			console.error(`${LOG_PREFIX} failed to spawn "${bin}":`, err);
			scheduleRestart();
			return;
		}
		child = spawned;
		console.log(
			`${LOG_PREFIX} started (pid ${spawned.pid}), listening on :${listenPort}`,
		);
		pipeToLog(spawned.stdout, (line) => console.log(line)).catch(() => {});
		pipeToLog(spawned.stderr, (line) => console.error(line)).catch(() => {});

		spawned.exited
			.then((code) => {
				if (child === spawned) child = null;
				if (shuttingDown) {
					console.log(`${LOG_PREFIX} exited (code ${code})`);
					return;
				}
				console.error(`${LOG_PREFIX} exited unexpectedly (code ${code})`);
				if (Date.now() - startedAt >= BACKOFF_RESET_AFTER_MS) {
					backoffMs = RESTART_BACKOFF_MIN_MS;
				}
				scheduleRestart();
			})
			.catch((err) =>
				console.error(`${LOG_PREFIX} process error:`, err),
			);
	}

	function scheduleRestart() {
		if (shuttingDown || restartTimer) return;
		const delay = backoffMs;
		backoffMs = Math.min(backoffMs * 2, RESTART_BACKOFF_MAX_MS);
		console.log(`${LOG_PREFIX} restarting in ${Math.round(delay / 1000)}s`);
		restartTimer = setTimeout(() => {
			restartTimer = null;
			spawnOnce().catch((err) =>
				console.error(`${LOG_PREFIX} restart failed:`, err),
			);
		}, delay);
		restartTimer.unref?.();
	}

	function stop() {
		if (shuttingDown) return;
		shuttingDown = true;
		if (restartTimer) {
			clearTimeout(restartTimer);
			restartTimer = null;
		}
		child?.kill();
	}

	return { start: spawnOnce, stop };
}

/**
 * Owns the Minecraft proxy: the socket-served control API the Go proxy asks for
 * every decision, plus the Go child process itself. Entirely inert unless
 * `MC_PROXY_ENABLED` is set to a true-ish value.
 */
export default async function run() {
	if (!(await isProxyEnabled())) {
		console.log(
			`${LOG_PREFIX} disabled (set MC_PROXY_ENABLED=true to enable the Minecraft proxy)`,
		);
		return;
	}

	const token =
		(await data
			.request("env:get", { key: "MC_PROXY_TOKEN" })
			.catch(() => undefined)) || crypto.randomUUID();
	const ipcPath = await getIpcPath();
	await prepareSocketPath(ipcPath);

	const app = createControlApp(token);
	const connection: HttpServer = app.listen(ipcPath, () => {
		try {
			chmodSync(ipcPath, CONTROL_SOCKET_MODE);
		} catch (err) {
			console.error(
				`${LOG_PREFIX} could not restrict "${ipcPath}" to the bot's own user:`,
				err,
			);
		}
		console.log(`${LOG_PREFIX} control API listening on ${ipcPath}`);
	});
	connection.on("error", (err) =>
		console.error(`${LOG_PREFIX} control API error:`, err),
	);

	const supervisor = createSupervisor(ipcPath, token);

	const shutdown = () => {
		supervisor.stop();
		connection.close(() => removeSocket(ipcPath));
	};
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
	process.once("beforeExit", shutdown);

	await supervisor.start();
}
