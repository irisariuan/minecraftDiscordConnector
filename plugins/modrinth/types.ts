import type { getPluginsByServerId } from "../../lib/db";

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
	/** Human-readable name of this version (e.g. "Version 1.0.0"). */
	name: string;
	version_number: string;
	/**
	 * Version ID, base62 encoded
	 */
	id: string;
	project_id: string;
	author_id: string;
	/** ISO-8601 date string */
	date_published: string;
	/** Minecraft versions this version supports. */
	game_versions: string[];
	/**
	 * Mod loaders this version supports.
	 * Values include `"forge"`, `"neoforge"`, `"fabric"`, `"quilt"`,
	 * `"paper"`, `"spigot"`, `"minecraft"` (resource packs), etc.
	 */
	loaders: string[];
	version_type: PluginVersionType;
	featured: boolean;
	downloads: number;
	dependencies: PluginVersionDependencyItem[];
	files: PluginVersionFileItem[];
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

/**
 * @deprecated The extra fields (`game_versions`, `dependencies`, `loaders`)
 * were incorrectly modelled here — per the Modrinth API those fields live on
 * the *version* object, not on individual file entries.  Use
 * `PluginGetVersionItem` fields directly instead.
 *
 * Kept as a type alias for backwards compatibility.
 */
export type PluginGetVersionFileItem = PluginVersionFileItem;

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

export interface SearchPluginProps {
	offset?: number;
	query?: string;
	facets?: Partial<SearchPluginFacets>;
	/** When true, skips the server_side:required/optional filter (needed for modpacks) */
	skipServerSideFilter?: boolean;
}

export interface SearchPluginFacets {
	categories: string[];
	versions: string[];
	project_type: string[];
}

export interface ListPluginVersionsProps {
	loaders?: string[];
	game_versions?: string[];
	featured?: boolean;
}

export type DbPlugin = Awaited<ReturnType<typeof getPluginsByServerId>>[number];

// ─── .mrpack types ────────────────────────────────────────────────────────────

export type MrpackSideValue = "required" | "optional" | "unsupported";

export interface MrpackFile {
	/** Destination path relative to the Minecraft instance directory */
	path: string;
	hashes: {
		sha1: string;
		sha512: string;
	};
	/** If omitted, the file is required on both sides */
	env?: {
		client: MrpackSideValue;
		server: MrpackSideValue;
	};
	/** HTTPS download URLs (first reachable one wins) */
	downloads: string[];
	fileSize: number;
}

export interface MrpackIndex {
	formatVersion: number;
	game: string;
	versionId: string;
	name: string;
	summary?: string;
	files: MrpackFile[];
	/** e.g. { minecraft: "1.20.1", "fabric-loader": "0.14.21" } */
	dependencies: Record<string, string>;
}

// ─── mcserver types ───────────────────────────────────────────────────────────

export const SERVER_TYPES = ["vanilla", "paper", "fabric", "forge"] as const;
export type ServerType = (typeof SERVER_TYPES)[number];

export interface MojangManifest {
	versions: { id: string; type: string; url: string }[];
}

export interface MojangVersionInfo {
	downloads: {
		server?: { url: string; sha1: string; size: number };
	};
}

export interface FabricVersion {
	version: string;
	stable: boolean;
}

export interface ForgePromotions {
	promos: Record<string, string>;
}

export interface CompatResult {
	projectId: string;
	title: string;
	currentVersion: string;
	/** null = unknown / not on Modrinth */
	compatible: boolean | null;
	availableVersionId: string | null;
}
export type RichUpdateEntry = {
	plugin: DbPlugin;
	projectTitle: string;
	/** Installed version */
	currentVersionNumber: string;
	currentVersionDate: number | null; // ms timestamp, null when unavailable
	/** Available (newer) version */
	newVersionId: string;
	newVersionNumber: string;
	newVersionDate: number; // ms timestamp, already transformed by listPluginVersions
	newFilename: string;
	/** File size in bytes, null when unavailable */
	newFileSize: number | null;
};
