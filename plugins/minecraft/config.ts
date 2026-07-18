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
	/** Port of the in-JVM connector REST API, or null when not enabled. */
	apiPort: number | null;
}

const schema = z.object({
	loaderType: z.string().min(1),
	modType: z.string().min(1),
	minecraftVersion: z.string().min(1),
	pluginDir: z.string().min(1),
	apiPort: z.number().int().nullable().default(null),
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
		apiPort: process.env.SERVER_API_PORT
			? Number(process.env.SERVER_API_PORT)
			: 6001,
	};
}
