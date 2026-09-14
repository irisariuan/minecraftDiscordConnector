import { z } from "zod";
import { safeJoin, type ConfigValidation } from "../api";

/**
 * Minecraft-specific server configuration. Stored in the generic
 * `Server.config` JSON column and validated here at the plugin boundary.
 */
export interface MinecraftConfig {
	loaderType: string;
	modType: string;
	minecraftVersion: string;
	pluginDir: string;
	/**
	 * Override for the IPC socket the in-JVM connector plugin attaches to —
	 * absolute, or relative to the server directory. Null uses the default
	 * (`connector.sock` in the server directory).
	 */
	ipcSocket: string | null;
	/** How this server is exposed through the Minecraft proxy. */
	proxy: MinecraftProxyConfig;
}

/**
 * Per-server proxy settings.
 *
 * The proxy is the online-mode authority: it authenticates the player against
 * Mojang and then hands the verified identity to the backend using
 * {@link MinecraftProxyConfig.forwarding}.
 *
 * `"bungeecord"` and `"velocity"` both require the backend to run in **offline
 * mode** with the matching forwarding option enabled (`bungeecord: true` in
 * Spigot's `spigot.yml` / the proxy-protocol flag of your fork, or Velocity
 * modern forwarding with the same secret). A backend configured that way trusts
 * whatever identity its connection claims, so it **must never be reachable from
 * the internet directly** — bind it to loopback or firewall its port so that
 * only the proxy can reach it. `"none"` forwards nothing and is only sane for a
 * backend with no identity requirements.
 */
export interface MinecraftProxyConfig {
	/** Whether this server is reachable through the proxy. */
	enabled: boolean;
	/** Host the proxy dials to reach the backend. */
	host: string;
	/** Player-info forwarding scheme the backend expects. */
	forwarding: "none" | "bungeecord" | "velocity";
	/** Velocity modern-forwarding secret; null for the other modes. */
	forwardingSecret: string | null;
}

const proxySchema = z
	.object({
		enabled: z.boolean().default(true),
		host: z.string().min(1).default("127.0.0.1"),
		forwarding: z
			.enum(["none", "bungeecord", "velocity"])
			.default("none"),
		forwardingSecret: z.string().nullable().default(null),
	})
	.default({
		enabled: true,
		host: "127.0.0.1",
		forwarding: "none",
		forwardingSecret: null,
	});

const schema = z.object({
	loaderType: z.string().min(1),
	modType: z.string().min(1),
	minecraftVersion: z.string().min(1),
	pluginDir: z.string().min(1),
	ipcSocket: z.string().min(1).nullable().default(null),
	proxy: proxySchema,
});

/** Validate + normalise a raw `Server.config` value into a {@link MinecraftConfig}. */
export function validateMinecraftConfig(
	raw: unknown,
): ConfigValidation<MinecraftConfig> {
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues
				.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
				.join("; "),
		};
	}
	return { ok: true, config: parsed.data };
}

/**
 * Default Minecraft config, derived from the legacy environment variables.
 * Used for backward-compatible bootstrap of a first server; returns null when
 * the required env vars are absent (a fresh multi-game install).
 */
export function envMinecraftConfig(): MinecraftConfig | null {
	const serverDir = process.env.SERVER_DIR;
	const loaderType = process.env.LOADER_TYPE;
	const modType = process.env.MOD_TYPE;
	const minecraftVersion = process.env.MINECRAFT_VERSION;
	if (!serverDir || !loaderType || !modType || !minecraftVersion) return null;
	return {
		loaderType,
		modType,
		minecraftVersion,
		pluginDir: safeJoin(serverDir, "plugins"),
		ipcSocket: null,
		proxy: {
			enabled: true,
			host: "127.0.0.1",
			forwarding: "none",
			forwardingSecret: null,
		},
	};
}
