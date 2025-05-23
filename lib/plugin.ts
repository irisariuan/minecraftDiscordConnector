import { createWriteStream, existsSync } from "node:fs";
import { join } from "node:path";
import { endsWith, notEndsWith, safeFetch } from "./utils";
import { readdir } from "node:fs/promises";

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

export interface PluginListVersionItem<Transformed extends boolean = false> {
  date_published: Transformed extends true ? number : string;
  version_number: string;
  game_versions: string[];
  id: string;
  project_id: string;
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

export async function searchPlugins({ offset = 0 }: { offset?: number } = {}) {
  const url = new URL("https://api.modrinth.com/v2/search");
  url.searchParams.set(
    "facets",
    JSON.stringify([
      [`categories:${LOADER_TYPE}`],
      [`versions:${MINECRAFT_VERSION}`],
      [`project_type:${MOD_TYPE}`],
    ]),
  );
  url.searchParams.set("limit", "100");
  url.searchParams.set("offset", offset.toString());
  const res = await safeFetch(url);
  const data = (await res
    ?.json()
    .catch<ErrorResponse>((err) => ({
      error: "[CLIENT] failed to parse JSON",
      description: err.message,
    }))) as PluginSearchQueryResponse | ErrorResponse;
  return data;
}

export async function getActivePlugins(
  useApi = false,
): Promise<string[] | null> {
  if (useApi) {
    return (await readdir(PLUGIN_DIR)).map((file) => notEndsWith(file, ".jar"));
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

export async function downloadLatestPlugin(
  slugOrId: string,
  options?: { force?: boolean } & ListPluginVersionsProps,
) {
  const metadata = await listPluginVersions(slugOrId, options);
  if (!metadata || !metadata[0]) return { filename: null, newDownload: false };
  metadata.sort((a, b) => b.date_published - a.date_published);
  return await downloadPluginFile(metadata[0].id, options?.force);
}

export async function downloadPluginFile(
  id: string,
  force = false,
): Promise<{ filename: string | null; newDownload: boolean }> {
  const metadata = await getPluginVersionDetails(id);
  if (!metadata || !metadata.files[0])
    return { filename: null, newDownload: false };
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
  return { filename: metadata.files[0].filename, newDownload: true };
}

export function createPathForPluginFile(fileName: string) {
  return join(PLUGIN_DIR, fileName);
}

export async function hasPlugin(slugOrId: string) {
  const metadata = await getPlugin(slugOrId);
  if (!metadata) return null;
  const versions = (
    await Promise.all(metadata.versions.map((v) => getPluginVersionDetails(v)))
  ).filter((v) => !!v);
  const versionNames = versions
    .map(
      (v) => v.files[0]?.filename && notEndsWith(v.files[0].filename, ".jar"),
    )
    .filter((v) => !!v);
  const dir = await readdir(PLUGIN_DIR);
  for (const file of dir) {
    if (versionNames.includes(endsWith(file, ".jar"))) return file;
  }
  return null;
}
