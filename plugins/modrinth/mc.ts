/**
 * Modrinth ↔ Minecraft/core bridge.
 *
 * Modrinth is a *package provider* for the Minecraft game plugin. Rather than
 * reaching into core internals, it depends on:
 *   - the Minecraft plugin's loader/jar discovery and jar-directory helpers, and
 *   - the generic `artifact:*` data channels, scoped to the `"modrinth"` provider.
 *
 * This module is the single place those dependencies live so the command files
 * stay focused on UX.
 */
import { data, type Server } from "../api";
import type { MinecraftConfig } from "../minecraft/config";

// Re-export the Minecraft loader/jar helpers Modrinth needs.
export {
	createPathForPluginFile,
	getActivePlugins,
} from "../minecraft/runtime/pluginDir";
export {
	findHighestAvailableVersion,
	getPaperProject,
	getPaperVersionBuild,
} from "../minecraft/loader/jar";
export {
	fetchVersionOptionsForLoader,
	KNOWN_LOADERS,
} from "../minecraft/loader/serverLoader";

/** Provider namespace used for every artifact Modrinth tracks. */
export const MODRINTH_PROVIDER = "modrinth";

/** Read a Minecraft server's validated config. */
export function mcConfig(server: Server): MinecraftConfig {
	return server.getPluginConfig() as unknown as MinecraftConfig;
}

/**
 * Modrinth's view of a tracked artifact. The legacy field names (`projectId`,
 * `versionId`) are preserved so the existing command/embeds code is unchanged;
 * they map onto the generic artifact record's `artifactId`/`versionId`.
 */
export interface ModrinthPlugin {
	projectId: string;
	versionId: string;
	filePath: string;
	createdAt: Date;
	updatedAt: Date;
	serverId: number;
}

/** List the Modrinth-tracked artifacts for a server. */
export async function getModrinthPlugins(
	serverId: number,
): Promise<ModrinthPlugin[]> {
	const artifacts = await data.request("artifact:list", {
		serverId,
		provider: MODRINTH_PROVIDER,
	});
	return artifacts.map((a) => ({
		projectId: a.artifactId,
		versionId: a.versionId,
		filePath: a.filePath,
		createdAt: a.createdAt,
		updatedAt: a.updatedAt,
		serverId: a.serverId,
	}));
}

/** Create/update a Modrinth artifact record. */
export async function trackModrinthPlugin(
	serverId: number,
	projectId: string,
	versionId: string,
	filePath: string,
): Promise<void> {
	await data.request("artifact:track", {
		provider: MODRINTH_PROVIDER,
		artifactId: projectId,
		versionId,
		serverId,
		filePath,
	});
}

/** Delete a Modrinth artifact record. */
export function deleteModrinthPlugin(
	serverId: number,
	projectId: string,
	versionId: string,
) {
	return data.request("artifact:delete", {
		provider: MODRINTH_PROVIDER,
		artifactId: projectId,
		versionId,
		serverId,
	});
}
