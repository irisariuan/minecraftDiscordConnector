import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { deletePluginByPath } from "../db";
import { ensureSuffix, removeSuffix, safeJoin } from "../utils";

/**
 * Get a list of active plugins from the server, either fetching from the server API or reading from the local plugin directory.
 */
export async function getActivePlugins(
	pluginDir: string,
	fileType = ".jar",
): Promise<string[] | null> {
	return (await readdir(pluginDir))
		.filter((file) => file.endsWith(fileType))
		.map((file) => removeSuffix(file, fileType));
}

export function createPathForPluginFile(pluginDir: string, fileName: string) {
	return safeJoin(pluginDir, fileName);
}

export async function removePluginByFileName(
	pluginDir: string,
	fileName: string,
	fileType = ".jar",
) {
	const path = createPathForPluginFile(
		pluginDir,
		ensureSuffix(fileName, fileType),
	);
	await deletePluginByPath(path);
	if (existsSync(path)) {
		await rm(path);
		return true;
	}
	return false;
}
