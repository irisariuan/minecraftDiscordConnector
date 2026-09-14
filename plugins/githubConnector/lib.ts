import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { data, safeFetch, safeJoin } from "../api";

// ─── Source repository ────────────────────────────────────────────────────────

export const GITHUB_OWNER = "irisariuan";
export const GITHUB_REPO = "discordMinecraftConnectorPlugin";
export const GITHUB_SLUG = `${GITHUB_OWNER}/${GITHUB_REPO}`;

/** Provider namespace under which the connector is tracked as a server artifact. */
const PROVIDER = "github";

const API_BASE = `https://api.github.com/repos/${GITHUB_SLUG}`;
const USER_AGENT = `ipBotDiscord-githubConnector (+https://github.com/${GITHUB_SLUG})`;

// ─── GitHub API types (partial) ───────────────────────────────────────────────

interface GithubAsset {
	name: string;
	browser_download_url: string;
	id: number;
	size: number;
}

interface GithubRelease {
	tag_name: string;
	name: string | null;
	html_url: string;
	prerelease: boolean;
	assets: GithubAsset[];
}

// ─── Install record (tracked via the generic artifact channels) ───────────────

/** What is currently installed for a server, derived from the artifact record. */
export interface ConnectorInstall {
	/** Release tag the installed jar came from (e.g. "v1.2.0"). */
	tag: string;
	/** File name of the installed asset. */
	assetName: string;
	/** Absolute path of the installed jar. */
	filePath: string;
}

/** Read the tracked connector install for a server, or null. */
export async function getInstalled(
	serverId: number,
): Promise<ConnectorInstall | null> {
	const artifacts = await data.request("artifact:list", {
		serverId,
		provider: PROVIDER,
	});
	const record = artifacts.find((a) => a.artifactId === GITHUB_SLUG);
	if (!record) return null;
	const meta = (record.metadata ?? {}) as { assetName?: string };
	return {
		tag: record.versionId,
		assetName: meta.assetName ?? "",
		filePath: record.filePath,
	};
}

/** Persist an install record, replacing any previous (different-tag) record. */
async function recordInstall(
	serverId: number,
	tag: string,
	filePath: string,
	assetName: string,
	prev: ConnectorInstall | null,
): Promise<void> {
	if (prev && prev.tag !== tag) {
		await data.request("artifact:delete", {
			provider: PROVIDER,
			artifactId: GITHUB_SLUG,
			versionId: prev.tag,
			serverId,
		});
	}
	await data.request("artifact:track", {
		provider: PROVIDER,
		artifactId: GITHUB_SLUG,
		versionId: tag,
		serverId,
		filePath,
		metadata: { assetName },
	});
}

// ─── GitHub helpers ───────────────────────────────────────────────────────────

async function getLatestRelease(): Promise<GithubRelease | null> {
	const res = await safeFetch(`${API_BASE}/releases/latest`, {
		headers: {
			"User-Agent": USER_AGENT,
			Accept: "application/vnd.github+json",
		},
	});
	if (!res?.ok) return null;
	return (await res.json().catch(() => null)) as GithubRelease | null;
}

/** Choose the jar asset to install from a release (first `.jar`). */
function pickJarAsset(release: GithubRelease): GithubAsset | null {
	return (
		release.assets.find((a) => a.name.toLowerCase().endsWith(".jar")) ?? null
	);
}

// ─── Update checking (no side effects) ────────────────────────────────────────

export interface UpdateCheck {
	installed: ConnectorInstall | null;
	latestTag: string | null;
	assetName: string | null;
	updateAvailable: boolean;
	/** Human-readable explanation of the verdict. */
	reason: string;
}

/**
 * Decide whether a newer connector build is available for `serverId`, by
 * comparing the installed **release tag** against the latest release. No
 * download or hashing is performed.
 */
export async function checkForUpdate(serverId: number): Promise<UpdateCheck> {
	const installed = await getInstalled(serverId);
	const release = await getLatestRelease();
	if (!release) {
		return {
			installed,
			latestTag: null,
			assetName: null,
			updateAvailable: false,
			reason: "Could not fetch the latest release from GitHub.",
		};
	}
	const asset = pickJarAsset(release);
	if (!asset) {
		return {
			installed,
			latestTag: release.tag_name,
			assetName: null,
			updateAvailable: false,
			reason: "Latest release has no .jar asset.",
		};
	}
	if (!installed) {
		return {
			installed: null,
			latestTag: release.tag_name,
			assetName: asset.name,
			updateAvailable: true,
			reason: "Connector is not installed on this server yet.",
		};
	}
	if (!existsSync(installed.filePath)) {
		return {
			installed,
			latestTag: release.tag_name,
			assetName: asset.name,
			updateAvailable: true,
			reason: "Tracked jar is missing on disk and will be reinstalled.",
		};
	}
	const available = installed.tag !== release.tag_name;
	return {
		installed,
		latestTag: release.tag_name,
		assetName: asset.name,
		updateAvailable: available,
		reason: available
			? `Newer release available (${installed.tag} → ${release.tag_name}).`
			: "Already on the latest release tag.",
	};
}

// ─── Install / sync (side effects) ────────────────────────────────────────────

export type SyncStatus =
	| "installed"
	| "updated"
	| "matched"
	| "upToDate"
	| "noRelease"
	| "noAsset"
	| "error";

export interface SyncResult {
	status: SyncStatus;
	tag?: string;
	assetName?: string;
	/** Previous tag, present when status is "updated". */
	fromTag?: string;
	message?: string;
}

/**
 * Ensure the latest connector jar is installed in `pluginDir` for `serverId`,
 * tracking the installed **release tag**.
 *
 * Behaviour:
 * - Already on the latest tag with the jar present → no-op (`upToDate`).
 * - The exact release jar already sits in the directory (e.g. placed manually)
 *   → adopt it and write the record without downloading (`matched`).
 * - Otherwise → download, install, and record (`installed` / `updated`).
 *
 * @param force  Re-download and reinstall even if already up to date.
 */
export async function syncConnector(
	serverId: number,
	pluginDir: string,
	force = false,
): Promise<SyncResult> {
	const release = await getLatestRelease();
	if (!release) return { status: "noRelease" };

	const asset = pickJarAsset(release);
	if (!asset) return { status: "noAsset", tag: release.tag_name };

	const prev = await getInstalled(serverId);
	const filePath = safeJoin(pluginDir, asset.name);

	// Already current — nothing to do.
	if (
		!force &&
		prev &&
		prev.tag === release.tag_name &&
		existsSync(prev.filePath)
	) {
		return {
			status: "upToDate",
			tag: prev.tag,
			assetName: prev.assetName,
		};
	}

	// The latest release jar already exists on disk — adopt & record it.
	if (!force && existsSync(filePath)) {
		await recordInstall(
			serverId,
			release.tag_name,
			filePath,
			asset.name,
			prev,
		);
		return {
			status: "matched",
			tag: release.tag_name,
			assetName: asset.name,
			fromTag: prev?.tag,
		};
	}

	// Download and install.
	const res = await safeFetch(asset.browser_download_url, {
		headers: {
			"User-Agent": USER_AGENT,
			Accept: "application/octet-stream",
		},
	});
	if (!res?.ok) {
		return {
			status: "error",
			tag: release.tag_name,
			message: "Failed to download the release asset from GitHub.",
		};
	}
	const buf = Buffer.from(await res.arrayBuffer());

	// Remove the previous jar if the file name changed, to avoid duplicates.
	if (prev && prev.assetName !== asset.name && existsSync(prev.filePath)) {
		await rm(prev.filePath).catch(() => {});
	}

	if (!existsSync(pluginDir)) {
		await mkdir(pluginDir, { recursive: true });
	}
	await writeFile(filePath, buf);
	await recordInstall(serverId, release.tag_name, filePath, asset.name, prev);

	return {
		status: prev ? "updated" : "installed",
		tag: release.tag_name,
		assetName: asset.name,
		fromTag: prev?.tag,
	};
}

/** Extract a Minecraft-style plugin directory from an opaque server config. */
export function pluginDirOf(config: unknown): string | null {
	if (config && typeof config === "object" && "pluginDir" in config) {
		const value = (config as Record<string, unknown>).pluginDir;
		return typeof value === "string" && value.length > 0 ? value : null;
	}
	return null;
}
