import { createStore, data, type PluginEnvKey } from "../../api";
import { validateMinecraftConfig, type MinecraftProxyConfig } from "../config";

/** Namespace of the proxy's operator-settings store. */
export const PROXY_STORE_NAMESPACE = "minecraftProxy";

/** Operator settings for the Minecraft proxy (set with `/proxy`). */
export const proxyStore = createStore(PROXY_STORE_NAMESPACE);

/** Port the proxy accepts Minecraft clients on (see `CONTROL_API.md`). */
export const DEFAULT_LISTEN_PORT = 25565;
/** Unix socket the bot serves the proxy control API on. */
export const DEFAULT_IPC_PATH = "data/mcproxy.sock";
/** Player cap advertised in the proxy's server-list ping. */
export const DEFAULT_MAX_PLAYERS = 100;
/** MOTD advertised in the proxy's server-list ping (legacy `§` codes). */
export const DEFAULT_MOTD = "§bServer Hub§r\n§7Join to start a server";
/** Where `bun run build:proxy` puts the compiled Go binary. */
export const DEFAULT_PROXY_BIN = "plugins/minecraft/proxy/bin/mcproxy";

/** Store keys, kept in one place so the command and the script agree. */
export const ProxyStoreKey = {
	voteChannelId: "voteChannelId",
	publicHost: "publicHost",
	motd: "motd",
	maxPlayers: "maxPlayers",
} as const;

const TRUE_VALUES = ["1", "true", "yes", "y", "on", "enable", "enabled"];

/** Read a whitelisted proxy environment variable, trimmed; null when unset. */
async function env(key: PluginEnvKey): Promise<string | null> {
	const value = await data.request("env:get", { key }).catch(() => undefined);
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/** Whether the operator has switched the proxy on. */
export async function isProxyEnabled(): Promise<boolean> {
	const raw = await env("MC_PROXY_ENABLED");
	return raw !== null && TRUE_VALUES.includes(raw.toLowerCase());
}

function toPort(raw: string | null, fallback: number): number {
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 && parsed < 65536
		? parsed
		: fallback;
}

/** Public Minecraft port the proxy listens on. */
export async function getListenPort(): Promise<number> {
	return toPort(await env("MC_PROXY_LISTEN_PORT"), DEFAULT_LISTEN_PORT);
}

/**
 * Path of the Unix socket the control API is served on.
 *
 * The bot and the proxy talk over a socket rather than a loopback port so that
 * access is decided by filesystem permissions. On a shared machine a loopback
 * port is reachable by every local process; a socket mode 0600 is not.
 */
export async function getIpcPath(): Promise<string> {
	return (await env("MC_PROXY_IPC_PATH")) ?? DEFAULT_IPC_PATH;
}

/** Path of the compiled Go proxy binary. */
export async function getProxyBin(): Promise<string> {
	return (await env("MC_PROXY_BIN")) ?? DEFAULT_PROXY_BIN;
}

/**
 * Address players use to reach the proxy — the target of the Transfer packet.
 * Empty string means "let the proxy reuse the handshake hostname".
 */
export async function getPublicHost(): Promise<string> {
	const stored = await proxyStore
		.get<string>(ProxyStoreKey.publicHost)
		.catch(() => null);
	if (typeof stored === "string" && stored.trim()) return stored.trim();
	return (await env("MC_PROXY_PUBLIC_HOST")) ?? "";
}

/** MOTD shown in the server list for the proxy itself. */
export async function getMotd(): Promise<string> {
	const stored = await proxyStore
		.get<string>(ProxyStoreKey.motd)
		.catch(() => null);
	return typeof stored === "string" && stored.length > 0
		? stored
		: DEFAULT_MOTD;
}

/** Player cap shown in the server list for the proxy itself. */
export async function getMaxPlayers(): Promise<number> {
	const stored = await proxyStore
		.get<number>(ProxyStoreKey.maxPlayers)
		.catch(() => null);
	return typeof stored === "number" && Number.isInteger(stored) && stored > 0
		? stored
		: DEFAULT_MAX_PLAYERS;
}

/** Channel start-approval polls raised from in game are posted to. */
export async function getVoteChannelId(): Promise<string | null> {
	const stored = await proxyStore
		.get<string>(ProxyStoreKey.voteChannelId)
		.catch(() => null);
	return typeof stored === "string" && stored.length > 0 ? stored : null;
}

/** Set (or, with `null`, clear) the in-game start-vote channel. */
export async function setVoteChannelId(channelId: string | null) {
	if (channelId === null) {
		await proxyStore.delete(ProxyStoreKey.voteChannelId);
		return;
	}
	await proxyStore.set(ProxyStoreKey.voteChannelId, channelId);
}

/** One managed Minecraft server as the proxy sees it. */
export interface ProxiedServer {
	id: number;
	tag: string | null;
	/** Host the proxy dials to reach the backend. */
	host: string;
	/** Backend Minecraft port (the first port on the server record). */
	port: number;
	/** Live process state. */
	online: boolean;
	forwarding: MinecraftProxyConfig["forwarding"];
	/** Only ever non-null for `"velocity"` forwarding. */
	forwardingSecret: string | null;
}

/** Server ids already reported as invalid — `/config` is polled every 2s. */
const warnedInvalidConfig = new Set<number>();

/**
 * Every managed server the proxy should front: `pluginId === "minecraft"`, a
 * valid Minecraft config, `config.proxy.enabled`, and at least one port.
 */
export async function listProxiedServers(): Promise<ProxiedServer[]> {
	const servers = await data.request("server:list");
	const result: ProxiedServer[] = [];
	for (const server of servers) {
		if (server.pluginId !== "minecraft") continue;
		const validated = validateMinecraftConfig(server.config);
		if (!validated.ok) {
			if (!warnedInvalidConfig.has(server.id)) {
				warnedInvalidConfig.add(server.id);
				console.warn(
					`[mcproxy] skipping server #${server.id}: invalid config (${validated.error})`,
				);
			}
			continue;
		}
		warnedInvalidConfig.delete(server.id);
		const proxy = validated.config.proxy;
		if (!proxy.enabled) continue;
		const port = server.port[0];
		if (typeof port !== "number") continue;
		result.push({
			id: server.id,
			tag: server.tag,
			host: proxy.host,
			port,
			online: server.online,
			forwarding: proxy.forwarding,
			forwardingSecret:
				proxy.forwarding === "velocity"
					? proxy.forwardingSecret
					: null,
		});
	}
	return result;
}
