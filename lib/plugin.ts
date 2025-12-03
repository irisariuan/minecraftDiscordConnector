import { createWriteStream, existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { deletePluginByPath, upsertNewPlugin } from "./db";
import type { Server } from "./server";
import { ensureSuffix, removeSuffix, safeFetch, safeJoin } from "./utils";

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

export interface ServerConfig {
	modType: string;
	serverDir: string;
	minecraftVersion: string;
	loaderType: string;
	pluginDir: string;
	tag: string | null;
	port: number[];
	apiPort: number | null;
}

export const serverConfig: ServerConfig = {
	modType: process.env.MOD_TYPE,
	serverDir: process.env.SERVER_DIR,
	minecraftVersion: process.env.MINECRAFT_VERSION,
	loaderType: process.env.LOADER_TYPE,
	pluginDir: safeJoin(process.env.SERVER_DIR, "plugins"),
	tag: process.env.SERVER_TAG || null,
	port: [parseInt(process.env.SERVER_PORT || "25565")],
	apiPort: parseInt(process.env.SERVER_API_PORT ?? "6001"),
};
export enum SideValue {
	Required = "required",
	Optional = "optional",
	Unsupported = "unsupported",
	Unknown = "unknown",
}
export enum ProjectType {
	Mod = "mod",
	Modpack = "modpack",
	Resourcepack = "resourcepack",
	Shader = "shader",
}

export enum ProjectStatus {
	Approved = "approved",
	Archived = "archived",
	Rejected = "rejected",
	Draft = "draft",
	Unlisted = "unlisted",
	Processing = "processing",
	Withheld = "withheld",
	Scheduled = "scheduled",
	Private = "private",
	Unknown = "unknown",
}

export interface PluginVersionDependencyItem {
	version_id: string;
	project_id: string;
	file_name: string;
	dependency_type: "required" | "optional" | "incompatible" | "embedded";
}

export enum PluginVersionType {
	Release = "release",
	Beta = "beta",
	Alpha = "alpha",
}

export interface PluginListVersionItem<Transformed extends boolean = false> {
	date_published: Transformed extends true ? number : string;
	version_number: string;
	game_versions: string[];
	id: string;
	project_id: string;
	version_type: PluginVersionType;
	loaders: string[];
	files: PluginVersionFileItem[];
	dependencies: PluginVersionDependencyItem[];
}

export interface PluginGetVersionItem {
	version_number: string;
	/**
	 * Version ID, base62 encoded
	 */
	id: string;
	project_id: string;
	files: PluginGetVersionFileItem[];
}

export interface PluginVersionFileItem {
	hashes: {
		sha1: string;
		sha512: string;
	};
	url: string;
	filename: string;
	primary: boolean;
	size: number;
	file_type: string;
}

export interface PluginGetVersionFileItem extends PluginVersionFileItem {
	game_versions: string[];
	dependencies: PluginVersionDependencyItem[];
	loaders: string[];
}

export interface PluginGetQueryItem extends PluginAPIResponseCommonItem {
	body: string;
	status: ProjectStatus;
	published: string;
	updated: string;
	approved: string | null;
	id: string;
	// plugin versions
	versions: string[];
	// game versions
	game_versions: string[];
	loaders: string[];
}

export interface PluginAPIResponseCommonItem {
	slug: string;
	title: string;
	description: string;
	client_side: SideValue;
	server_side: SideValue;
	project_type: ProjectType;
	downloads: number;
	license: string;
	icon_url: string;
	author: string;
}

/**
 * @description Partial representation of a plugin query from Modrinth
 * @see https://docs.modrinth.com/api/operations/searchprojects/
 */
export interface PluginSearchQueryItem<
	Transformed extends boolean = false,
> extends PluginAPIResponseCommonItem {
	categories: string[];
	project_id: string;
	// game versions
	versions: string[];
	// ISO-8601 date format
	date_created: Transformed extends true ? number : string;
	date_modified: Transformed extends true ? number : string;
	// latest game version
	latest_version: string;
	server_side: SideValue;
}

export interface PluginSearchQueryResponse {
	hits: PluginSearchQueryItem[];
	offset: number;
	limit: number;
	total_hits: number;
}

export interface ErrorResponse {
	error: string;
	description: string;
}

interface SearchPluginProps {
	offset?: number;
	query?: string;
	facets?: Partial<SearchPluginFacets>;
}
interface SearchPluginFacets {
	categories: string[];
	versions: string[];
	project_type: string[];
}

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

interface ListPluginVersionsProps {
	loaders?: string[];
	game_versions?: string[];
	featured?: boolean;
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
