/**
 * IPC transport between the bot and the in-JVM connector plugin.
 *
 * The bot listens on a Unix domain socket (one per managed server) and the
 * connector plugin inside the Minecraft JVM dials it, so neither side opens a
 * TCP port. The socket path is handed to the server process in the
 * {@link IPC_ENV_VAR} environment variable at launch; a manually started server
 * falls back to {@link defaultSocketPath} inside its own directory.
 *
 * Framing is newline-delimited JSON, one object per line, used in both
 * directions over the same connection:
 *
 * ```text
 * → {"t":"hello","v":1,"serverPort":25565,"platform":"paper","version":"1.0.0"}
 * ← {"t":"welcome","v":1,"serverId":3}
 * ← {"t":"req","id":"b1","method":"player.list","params":null}
 * → {"t":"res","id":"b1","ok":true,"result":{"players":[…]}}
 * → {"t":"req","id":"p1","method":"player.verify","params":{…}}
 * ← {"t":"res","id":"p1","ok":true,"result":{"verified":true}}
 * ```
 *
 * Request ids are only ever matched against the pending table of the side that
 * sent them, and are prefixed per direction (`b`/`p`) to keep traces readable.
 */
import { chmod, unlink } from "node:fs/promises";
import net from "node:net";
import { isAbsolute, join } from "node:path";
import type { ParsedLogLine, PlayerInfo } from "../../api";

/** Wire-format version; both sides must agree. */
export const IPC_PROTOCOL_VERSION = 1;

/** Environment variable the connector plugin reads to find its socket. */
export const IPC_ENV_VAR = "CONNECTOR_IPC_SOCKET";

/** Socket file name used when a server does not override it. */
export const DEFAULT_SOCKET_NAME = "connector.sock";

/**
 * Where a server's socket lives: its `ipcSocket` override (absolute, or
 * relative to the server directory) or {@link DEFAULT_SOCKET_NAME} beside it.
 * The connector plugin derives the same default from its working directory when
 * the server is started by hand instead of by the bot.
 */
export function socketPathFor(
	serverDir: string,
	ipcSocket: string | null = null,
): string {
	if (!ipcSocket) return join(serverDir, DEFAULT_SOCKET_NAME);
	return isAbsolute(ipcSocket) ? ipcSocket : join(serverDir, ipcSocket);
}

/** How long a request waits for its response before being rejected. */
const DEFAULT_TIMEOUT_MS = 10_000;
/** Console commands are executed on the main thread and may queue behind ticks. */
const COMMAND_TIMEOUT_MS = 15_000;
/** Guard against a peer that never sends a newline. */
const MAX_LINE_BYTES = 8 * 1024 * 1024;

const LOG_PREFIX = "[minecraft:ipc]";

// ─── Method tables ─────────────────────────────────────────────────────────────

/** Methods the bot calls on the connector plugin. */
export interface PluginMethods {
	ping: { params: undefined; result: Record<string, never> };
	"command.run": {
		params: { command: string };
		result: { success: boolean; output: string | null; logger: string | null };
	};
	"player.list": { params: undefined; result: { players: PlayerInfo[] } };
	/** Deliver a link OTP in-game; resolves the player by name or uuid. */
	"player.register": {
		params: { playerName?: string; uuid?: string; otp: string };
		result: { uuid: string };
	};
	/** Mark an already-linked player as verified (lifts join restrictions). */
	"player.markVerified": { params: { uuid: string }; result: Record<string, never> };
	"logs.get": { params: undefined; result: { lines: ParsedLogLine[] } };
	"shutdown.schedule": {
		params: { tick: number };
		result: { success: boolean };
	};
	"shutdown.cancel": { params: undefined; result: { success: boolean } };
	"shutdown.status": { params: undefined; result: { scheduled: boolean } };
	"components.list": { params: undefined; result: { components: string[] } };
}

/** Methods the connector plugin calls on the bot. */
export interface HostMethods {
	/** Is this player linked to a Discord account? */
	"player.verify": {
		params: { uuid: string; playerName: string };
		result: { verified: boolean };
	};
	/** Session heartbeat; the bot charges play fees and may ask for a kick. */
	"player.play": {
		params: {
			uuid: string;
			playerName: string;
			onlineTime: number;
			disconnect?: boolean;
		};
		result: { kick: boolean };
	};
	/** A player asked in-game to cancel a scheduled shutdown (charged). */
	"shutdown.requestCancel": {
		params: { uuid: string; playerName: string };
		result: { allowed: boolean; reason?: string };
	};
}

/** Handlers for plugin-initiated requests, supplied by the callback module. */
export type HostHandlers = {
	[M in keyof HostMethods]: (
		params: HostMethods[M]["params"],
		connection: ConnectorConnection,
	) => Promise<HostMethods[M]["result"]>;
};

/** A live connection from one server's connector plugin. */
export interface ConnectorConnection {
	readonly serverId: number;
	/** Port the Minecraft server reported at handshake, when known. */
	readonly serverPort: number | null;
	/** Loader the plugin runs on ("paper", "fabric", "neoforge"). */
	readonly platform: string | null;
	request<M extends keyof PluginMethods>(
		method: M,
		...args: PluginMethods[M]["params"] extends undefined
			? []
			: [PluginMethods[M]["params"]]
	): Promise<PluginMethods[M]["result"]>;
}

// ─── Frames ────────────────────────────────────────────────────────────────────

interface HelloFrame {
	t: "hello";
	v?: number;
	serverPort?: number;
	platform?: string;
	version?: string;
}
interface RequestFrame {
	t: "req";
	id: string;
	method: string;
	params?: unknown;
}
type ResponseFrame =
	| { t: "res"; id: string; ok: true; result: unknown }
	| { t: "res"; id: string; ok: false; error: string };

type InboundFrame = HelloFrame | RequestFrame | ResponseFrame;

// ─── Connection ────────────────────────────────────────────────────────────────

interface Pending {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
}

class Connection implements ConnectorConnection {
	private buffer = "";
	private nextId = 1;
	private readonly pending = new Map<string, Pending>();
	private closed = false;

	serverPort: number | null = null;
	platform: string | null = null;
	/** Set once the peer has introduced itself; only then is it routable. */
	greeted = false;

	constructor(
		readonly serverId: number,
		private readonly socket: net.Socket,
		private readonly handlers: HostHandlers,
		private readonly onGreeting: (connection: Connection) => void,
		private readonly onClose: (connection: Connection) => void,
	) {
		socket.setEncoding("utf8");
		socket.on("data", (chunk: string) => this.onData(chunk));
		socket.on("error", (err) =>
			console.error(
				`${LOG_PREFIX} socket error for server #${serverId}:`,
				err.message,
			),
		);
		socket.on("close", () => this.destroy("connection closed"));
	}

	// ── Reading ──────────────────────────────────────────────────────────────

	private onData(chunk: string) {
		this.buffer += chunk;
		if (this.buffer.length > MAX_LINE_BYTES) {
			console.error(
				`${LOG_PREFIX} oversized frame from server #${this.serverId}, dropping connection`,
			);
			this.socket.destroy();
			return;
		}
		let index = this.buffer.indexOf("\n");
		while (index !== -1) {
			const line = this.buffer.slice(0, index).trim();
			this.buffer = this.buffer.slice(index + 1);
			if (line) this.handleLine(line);
			index = this.buffer.indexOf("\n");
		}
	}

	private handleLine(line: string) {
		let frame: InboundFrame;
		try {
			frame = JSON.parse(line) as InboundFrame;
		} catch {
			console.error(
				`${LOG_PREFIX} malformed frame from server #${this.serverId}`,
			);
			return;
		}
		switch (frame.t) {
			case "hello":
				this.serverPort = frame.serverPort ?? null;
				this.platform = frame.platform ?? null;
				if (frame.v !== undefined && frame.v !== IPC_PROTOCOL_VERSION) {
					console.warn(
						`${LOG_PREFIX} server #${this.serverId} speaks protocol v${frame.v}, bot speaks v${IPC_PROTOCOL_VERSION}`,
					);
				}
				this.greeted = true;
				this.send({
					t: "welcome",
					v: IPC_PROTOCOL_VERSION,
					serverId: this.serverId,
				});
				console.log(
					`${LOG_PREFIX} server #${this.serverId} attached (${this.platform ?? "unknown"} ${frame.version ?? ""})`.trimEnd(),
				);
				this.onGreeting(this);
				return;
			case "req":
				void this.dispatch(frame);
				return;
			case "res": {
				const pending = this.pending.get(frame.id);
				if (!pending) return;
				this.pending.delete(frame.id);
				clearTimeout(pending.timer);
				if (frame.ok) pending.resolve(frame.result);
				else pending.reject(new Error(frame.error));
				return;
			}
		}
	}

	/** Run a plugin-initiated request through the host handlers. */
	private async dispatch(frame: RequestFrame) {
		const handler = (this.handlers as Record<string, unknown>)[frame.method];
		if (typeof handler !== "function") {
			this.send({
				t: "res",
				id: frame.id,
				ok: false,
				error: `Unknown method "${frame.method}"`,
			});
			return;
		}
		try {
			const result = await (
				handler as (params: unknown, c: ConnectorConnection) => Promise<unknown>
			)(frame.params ?? {}, this);
			this.send({ t: "res", id: frame.id, ok: true, result: result ?? {} });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error(
				`${LOG_PREFIX} handler "${frame.method}" failed for server #${this.serverId}:`,
				message,
			);
			this.send({ t: "res", id: frame.id, ok: false, error: message });
		}
	}

	// ── Writing ──────────────────────────────────────────────────────────────

	private send(frame: Record<string, unknown>) {
		if (this.closed) return;
		this.socket.write(`${JSON.stringify(frame)}\n`);
	}

	request<M extends keyof PluginMethods>(
		method: M,
		...args: PluginMethods[M]["params"] extends undefined
			? []
			: [PluginMethods[M]["params"]]
	): Promise<PluginMethods[M]["result"]> {
		if (this.closed) {
			return Promise.reject(
				new Error(`Connector plugin for server #${this.serverId} is detached`),
			);
		}
		const id = `b${this.nextId++}`;
		const timeoutMs =
			method === "command.run" ? COMMAND_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`"${method}" timed out after ${timeoutMs}ms`));
			}, timeoutMs);
			this.pending.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
				timer,
			});
			this.send({ t: "req", id, method, params: args[0] ?? null });
		});
	}

	/** Reject everything in flight and forget the connection. */
	destroy(reason: string) {
		if (this.closed) return;
		this.closed = true;
		for (const [, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error(reason));
		}
		this.pending.clear();
		this.socket.destroy();
		this.onClose(this);
	}
}

// ─── Per-server listeners ──────────────────────────────────────────────────────

interface Listener {
	server: net.Server;
	path: string;
	connections: Set<Connection>;
	active: Connection | null;
}

const listeners = new Map<number, Listener>();
let hostHandlers: HostHandlers | null = null;

/**
 * Install the handlers used for plugin-initiated requests. Called once at
 * startup by the minecraft plugin's IPC script.
 */
export function setHostHandlers(handlers: HostHandlers) {
	hostHandlers = handlers;
}

/**
 * Start listening for the connector plugin of `serverId`, if not already.
 * Returns the socket path to hand to the server process.
 */
export async function openIpcListener(
	serverId: number,
	socketPath: string,
): Promise<string> {
	const existing = listeners.get(serverId);
	if (existing) {
		if (existing.path === socketPath) return socketPath;
		await closeIpcListener(serverId);
	}
	if (!hostHandlers) {
		throw new Error("IPC host handlers were never installed");
	}
	const handlers = hostHandlers;
	// sun_path is 104 bytes on macOS, 108 on Linux; bind() fails cryptically past it.
	if (Buffer.byteLength(socketPath) > 100) {
		throw new Error(
			`Socket path is too long for a Unix socket (${socketPath}). Set the server's "ipcSocket" config to a shorter path.`,
		);
	}

	// A crash can leave the node behind; binding would then fail with EADDRINUSE.
	await unlink(socketPath).catch(() => {});

	const listener: Listener = {
		server: net.createServer(),
		path: socketPath,
		connections: new Set(),
		active: null,
	};
	listener.server.on("connection", (socket) => {
		const connection = new Connection(
			serverId,
			socket,
			handlers,
			(greeted) => {
				// A reconnect supersedes the previous attachment. Swap first so
				// the old connection's teardown does not clear the new one.
				const previous = listener.active;
				listener.active = greeted;
				previous?.destroy("superseded by a new connection");
			},
			(closed) => {
				listener.connections.delete(closed);
				if (listener.active === closed) {
					listener.active = null;
					if (closed.greeted) {
						console.log(
							`${LOG_PREFIX} server #${serverId} detached`,
						);
					}
				}
			},
		);
		listener.connections.add(connection);
	});
	listener.server.on("error", (err) =>
		console.error(`${LOG_PREFIX} listener error for server #${serverId}:`, err),
	);

	await new Promise<void>((resolve, reject) => {
		listener.server.once("error", reject);
		listener.server.listen(socketPath, () => {
			listener.server.off("error", reject);
			resolve();
		});
	});
	// Anyone who can open the socket can run console commands, so keep it to the
	// account the bot and the server process share.
	await chmod(socketPath, 0o600).catch(() => {});

	listeners.set(serverId, listener);
	console.log(`${LOG_PREFIX} listening for server #${serverId} on ${socketPath}`);
	return socketPath;
}

/** Stop listening for a server and remove its socket node. */
export async function closeIpcListener(serverId: number): Promise<void> {
	const listener = listeners.get(serverId);
	if (!listener) return;
	listeners.delete(serverId);
	for (const connection of listener.connections) {
		connection.destroy("listener closed");
	}
	await new Promise<void>((resolve) => listener.server.close(() => resolve()));
	await unlink(listener.path).catch(() => {});
}

/** The attached connector plugin for a server, or null when none is connected. */
export function connectionFor(serverId: number): ConnectorConnection | null {
	return listeners.get(serverId)?.active ?? null;
}

/** Whether a server's connector plugin is currently attached. */
export function isAttached(serverId: number): boolean {
	return connectionFor(serverId) !== null;
}
