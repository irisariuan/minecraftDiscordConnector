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

export interface SearchPluginProps {
	offset?: number;
	query?: string;
	facets?: Partial<SearchPluginFacets>;
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
