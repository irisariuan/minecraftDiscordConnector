import { createWriteStream, existsSync } from "node:fs";
import { join } from "node:path";
import { ensureSuffix, removeSuffix, safeFetch } from "./utils";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";

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
	!existsSync(join(process.env.SERVER_DIR, "/plugins"))
)
	throw new Error("SERVER_DIR environment variable is not set");

export const MOD_TYPE = process.env.MOD_TYPE;
export const SERVER_DIR = process.env.SERVER_DIR;
export const MINECRAFT_VERSION = process.env.MINECRAFT_VERSION;
export const LOADER_TYPE = process.env.LOADER_TYPE;
export const PLUGIN_DIR = join(SERVER_DIR, "plugins");
export const PLUGIN_JSON_PATH = join(process.cwd(), "data", "plugins.json");

type SideValue = "required" | "optional" | "unsupported" | "unknown";
type ProjectType = "mod" | "modpack" | "resourcepack" | "shader";
type ProjectStatus =
	| "approved"
	| "archived"
	| "rejected"
	| "draft"
	| "unlisted"
	| "processing"
	| "withheld"
	| "scheduled"
	| "private"
	| "unknown";

export interface PluginVersionDependencyItem {
	version_id: string;
	project_id: string;
	file_name: string;
	dependency_type: "required" | "optional" | "incompatible" | "embedded";
}

export type PluginVersionType = "release" | "beta" | "alpha";

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
export interface PluginSearchQueryItem<Transformed extends boolean = false>
	extends PluginAPIResponseCommonItem {
	categories: string[];
	project_id: string;
	// game versions
	versions: string[];
	// ISO-8601 date format
	date_created: Transformed extends true ? number : string;
	date_modified: Transformed extends true ? number : string;
	// latest game version
	latest_version: string;
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

function buildFacets(facets: Partial<SearchPluginFacets>) {
	const result: string[][] = [];
	if (facets.categories) {
		result.push([...facets.categories.map((v) => `categories:${v}`)]);
	}
	if (facets.versions) {
		result.push([...facets.versions.map((v) => `versions:${v}`)]);
	}
	if (facets.project_type) {
		result.push([...facets.project_type.map((v) => `project_type:${v}`)]);
	}
	return result;
}

export async function searchPlugins(
	{ offset = 0, query, facets }: SearchPluginProps = {
		facets: {
			categories: [LOADER_TYPE],
			project_type: [MOD_TYPE],
			versions: [MINECRAFT_VERSION],
		},
	},
) {
	const url = new URL("https://api.modrinth.com/v2/search");
	url.searchParams.set("limit", "100");
	url.searchParams.set("offset", offset.toString());
	if (facets) {
		url.searchParams.set("facets", JSON.stringify(buildFacets(facets)));
	}
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
	localCheck = false,
): Promise<string[] | null> {
	if (localCheck) {
		return (await readdir(PLUGIN_DIR))
			.filter((file) => file.endsWith(".jar"))
			.map((file) => removeSuffix(file, ".jar"));
	}
	const res = await safeFetch("http://localhost:6001/plugins");
	if (!res?.ok) return null;
	const data = (await res.json()) as string[];
	return data;
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
	id: string,
	force = false,
): Promise<{ filename: string | null; newDownload: boolean }> {
	const metadata = await getPluginVersionDetails(id);
	if (!metadata || !metadata.files[0]) {
		return { filename: null, newDownload: false };
	}
	await addPluginToJson({
		downloadedAt: Date.now(),
		fileName: metadata.files[0].filename,
		projectId: metadata.project_id,
		versionId: metadata.id,
	});
	if (
		!force &&
		existsSync(createPathForPluginFile(metadata.files[0].filename))
	) {
		console.log(
			`File ${metadata.files[0].filename} already exists, skipping download`,
		);
		return { filename: metadata.files[0].filename, newDownload: false };
	}
	const res = await safeFetch(metadata.files[0].url);
	if (!res?.ok) return { filename: null, newDownload: false };
	const stream = createWriteStream(
		createPathForPluginFile(metadata.files[0].filename),
	);
	const data = res.body;
	if (!data) return { filename: null, newDownload: false };
	for await (const chunk of data) {
		stream.write(chunk);
	}
	stream.end();
	console.log(`Downloaded ${metadata.files[0].filename}`);
	return { filename: metadata.files[0].filename, newDownload: true };
}

export function createPathForPluginFile(fileName: string) {
	return join(PLUGIN_DIR, fileName);
}

interface PluginJsonEntry {
	projectId: string;
	versionId: string;
	fileName: string;
	downloadedAt: number;
}

async function readPluginsJson(): Promise<PluginJsonEntry[]> {
	try {
		return JSON.parse(await readFile(PLUGIN_JSON_PATH, "utf-8"));
	} catch {
		return [];
	}
}

async function addPluginToJson(plugin: PluginJsonEntry) {
	const json = await readPluginsJson();
	if (json.find((p) => p.fileName === plugin.fileName)) return;
	await writePluginsJson([...json, plugin]);
}

async function writePluginsJson(plugins: PluginJsonEntry[]) {
	await writeFile(PLUGIN_JSON_PATH, JSON.stringify(plugins, null, 4));
}

/**
 * Returning the filename of a downloaded plugin, not including custom plugins
 */
export async function getPluginFileName(slugOrId: string) {
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
	const dir = await readdir(PLUGIN_DIR);
	for (const file of dir) {
		if (versionNames.includes(ensureSuffix(file, ".jar"))) return file;
	}
	return null;
}

export async function removePluginByFileName(fileName: string) {
	const path = createPathForPluginFile(ensureSuffix(fileName, ".jar"));
	if (existsSync(path)) {
		await rm(path);
		return true;
	}
	const json = await readPluginsJson();
	const filtered = json.filter(
		(p) =>
			removeSuffix(p.fileName, ".jar") !== removeSuffix(fileName, ".jar"),
	);
	if (json.length !== filtered.length) {
		await writePluginsJson(
			json.filter(
				(p) =>
					removeSuffix(p.fileName, ".jar") !==
					removeSuffix(fileName, ".jar"),
			),
		);
	}
	return false;
}

export async function removePluginBySlugOrId(slugOrId: string) {
	const fileName = await getPluginFileName(slugOrId);
	if (fileName) {
		return await removePluginByFileName(fileName);
	}
	return false;
}
