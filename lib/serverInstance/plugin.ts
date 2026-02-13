import { createWriteStream, existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { deletePluginByPath, upsertNewPlugin } from "../db";
import type { Server } from "../server";
import { ensureSuffix, removeSuffix, safeFetch, safeJoin } from "../utils";
import type {
    ErrorResponse,
    ListPluginVersionsProps,
    PluginGetQueryItem,
    PluginGetVersionItem,
    PluginListVersionItem,
    PluginSearchQueryResponse,
    SearchPluginFacets,
    SearchPluginProps
} from "./plugin/types";
import {
    SideValue
} from "./plugin/types";

if (
	!process.env.MINECRAFT_VERSION ||
	!process.env.LOADER_TYPE ||
	!process.env.MOD_TYPE
)
	throw new Error(
		"MINECRAFT_VERSION, LOADER_TYPE, or MOD_TYPE environment variable is not set",
	);
if (
	!process.env.SERVER_DIR ||
	!existsSync(safeJoin(process.env.SERVER_DIR, "/plugins"))
)
	throw new Error("SERVER_DIR environment variable is not set");

function buildFacets(facets?: Partial<SearchPluginFacets>) {
	const result: string[][] = [];
	if (facets?.categories) {
		result.push([...facets.categories.map((v) => `categories:${v}`)]);
	}
	if (facets?.versions) {
		result.push([...facets.versions.map((v) => `versions:${v}`)]);
	}
	if (facets?.project_type) {
		result.push([...facets.project_type.map((v) => `project_type:${v}`)]);
	}

	result.push([
		`server_side:${SideValue.Optional}`,
		`server_side:${SideValue.Required}`,
	]);
	return result;
}

export async function searchPlugins({
	offset = 0,
	query,
	facets,
}: SearchPluginProps) {
	const url = new URL("https://api.modrinth.com/v2/search");
	url.searchParams.set("limit", "100");
	url.searchParams.set("offset", offset.toString());
	url.searchParams.set("facets", JSON.stringify(buildFacets(facets)));

	if (query) {
		url.searchParams.set("query", query);
	}
	const res = await safeFetch(url);
	const data = (await res?.json().catch<ErrorResponse>((err) => ({
		error: "[CLIENT] failed to parse JSON",
		description: err.message,
	}))) as PluginSearchQueryResponse | ErrorResponse;
	return data;
}

/**
 * Get a list of active plugins from the server, either fetching from the server API or reading from the local plugin directory.
 */
export async function getActivePlugins(
	pluginDir: string,
): Promise<string[] | null> {
	return (await readdir(pluginDir))
		.filter((file) => file.endsWith(".jar"))
		.map((file) => removeSuffix(file, ".jar"));
}

export async function getPlugin(slugOrId: string) {
	const url = new URL(`https://api.modrinth.com/v2/project/${slugOrId}`);
	const res = await safeFetch(url);
	if (!res?.ok) return null;
	const data = (await res.json()) as PluginGetQueryItem;
	return data;
}

export async function getPluginVersionDetails(id: string) {
	const url = new URL(`https://api.modrinth.com/v2/version/${id}`);
	const res = await safeFetch(url);
	if (!res?.ok) return null;
	const data = (await res.json()) as PluginGetVersionItem;
	return data;
}

export async function listPluginVersions(
	slugOrId: string,
	options?: ListPluginVersionsProps,
) {
	const url = new URL(
		`https://api.modrinth.com/v2/project/${slugOrId}/version`,
	);
	if (options?.featured) {
		url.searchParams.set("featured", "true");
	}
	if (options?.loaders) {
		url.searchParams.set("loaders", JSON.stringify(options.loaders));
	}
	if (options?.game_versions) {
		url.searchParams.set(
			"game_versions",
			JSON.stringify(options.game_versions),
		);
	}
	const res = await safeFetch(url);
	if (!res?.ok) return null;
	const data = (await res.json()) as PluginListVersionItem[];
	return data.map(
		(item): PluginListVersionItem<true> => ({
			...item,
			date_published: new Date(item.date_published).getTime(),
		}),
	);
}

export async function downloadPluginFile(
	server: Server,
	id: string,
	force = false,
): Promise<{ filename: string | null; newDownload: boolean }> {
	const metadata = await getPluginVersionDetails(id);
	if (!metadata || !metadata.files[0]) {
		return { filename: null, newDownload: false };
	}
	const filePath = createPathForPluginFile(
		server.config.pluginDir,
		metadata.files[0].filename,
	);
	if (!force && existsSync(filePath)) {
		console.log(
			`File ${metadata.files[0].filename} already exists, skipping download`,
		);
		return { filename: metadata.files[0].filename, newDownload: false };
	}
	const res = await safeFetch(metadata.files[0].url);
	if (!res?.ok) return { filename: null, newDownload: false };
	const stream = createWriteStream(filePath);
	const data = res.body;
	if (!data) return { filename: null, newDownload: false };
	for await (const chunk of data) {
		stream.write(chunk);
	}
	stream.end();
	console.log(`Downloaded ${metadata.files[0].filename}`);
	await upsertNewPlugin({
		create: {
			projectId: metadata.project_id,
			filePath,
			versionId: id,
			serverId: server.id,
		},
		update: { filePath, versionId: id },
		where: {
			projectId_versionId_serverId: {
				versionId: id,
				serverId: server.id,
				projectId: metadata.project_id,
			},
		},
	});
	return { filename: metadata.files[0].filename, newDownload: true };
}

export function createPathForPluginFile(pluginDir: string, fileName: string) {
	return safeJoin(pluginDir, fileName);
}
/**
 * Returning the filename of a downloaded plugin, not including custom plugins
 */
export async function getPluginFileName(pluginDir: string, slugOrId: string) {
	const metadata = await getPlugin(slugOrId);
	if (!metadata) return null;
	const versions = (
		await Promise.all(
			metadata.versions.map((v) => getPluginVersionDetails(v)),
		)
	).filter((v) => !!v);
	const versionNames = versions
		.map(
			(v) =>
				v.files[0]?.filename &&
				removeSuffix(v.files[0].filename, ".jar"),
		)
		.filter((v) => !!v);
	const dir = await readdir(pluginDir);
	for (const file of dir) {
		if (versionNames.includes(ensureSuffix(file, ".jar"))) return file;
	}
	return null;
}

export async function removePluginByFileName(
	pluginDir: string,
	fileName: string,
) {
	const path = createPathForPluginFile(
		pluginDir,
		ensureSuffix(fileName, ".jar"),
	);
	await deletePluginByPath(path);
	if (existsSync(path)) {
		await rm(path);
		return true;
	}
	return false;
}
