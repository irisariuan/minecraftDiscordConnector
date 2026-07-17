import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createPathForPluginFile, createStore, safeFetch } from "../api";

// ─── Source repository ────────────────────────────────────────────────────────

export const GITHUB_OWNER = "irisariuan";
export const GITHUB_REPO = "discordMinecraftConnectorPlugin";
export const GITHUB_SLUG = `${GITHUB_OWNER}/${GITHUB_REPO}`;

const API_BASE = `https://api.github.com/repos/${GITHUB_SLUG}`;
const USER_AGENT = `ipBotDiscord-githubConnector (+https://github.com/${GITHUB_SLUG})`;

// ─── GitHub API types (partial) ───────────────────────────────────────────────

interface GithubAsset {
	name: string;
	browser_download_url: string;
	id: number;
	size: number;
	/** Newer GitHub API returns e.g. "sha256:abc…"; may be absent on older releases. */
	digest?: string | null;
}

interface GithubRelease {
	tag_name: string;
	name: string | null;
	html_url: string;
	prerelease: boolean;
	assets: GithubAsset[];
}

// ─── Persistent per-server state ──────────────────────────────────────────────

/** What we last installed for a given server. */
export interface ConnectorState {
	/** Release tag the installed jar came from (e.g. "v1.2.0"). */
	tag: string;
	/** Hex sha256 of the installed jar — the source of truth for updates. */
	sha256: string;
	/** File name of the installed asset. */
	assetName: string;
	/** GitHub asset id, for reference. */
	assetId: number;
	/** Absolute path of the installed jar. */
	filePath: string;
	/** Epoch ms of the last install/update. */
	installedAt: number;
}

const store = createStore("githubConnector");
const stateKey = (serverId: number) => `server:${serverId}`;

export function getConnectorState(
	serverId: number,
): Promise<ConnectorState | null> {
	return store.get<ConnectorState>(stateKey(serverId));
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

/** Extract the hex sha256 from an asset's `digest` field, when present. */
function assetSha256(asset: GithubAsset): string | null {
	if (!asset.digest) return null;
	const [algo, hex] = asset.digest.split(":");
	return algo === "sha256" && hex ? hex.toLowerCase() : null;
}

function sha256Hex(buf: Buffer): string {
	return createHash("sha256").update(buf).digest("hex");
}

// ─── Update checking (no side effects) ────────────────────────────────────────

export interface UpdateCheck {
	installed: ConnectorState | null;
	latestTag: string | null;
	assetName: string | null;
	updateAvailable: boolean;
	/** Human-readable explanation of the verdict. */
	reason: string;
}

/**
 * Decide whether a newer connector build is available for `serverId`, without
 * downloading or installing anything.
 *
 * Uses the release asset's sha256 digest when GitHub provides it (exact,
 * content-based). Falls back to comparing the release tag when no digest is
 * exposed.
 */
export async function checkForUpdate(serverId: number): Promise<UpdateCheck> {
	const installed = await getConnectorState(serverId);
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
	const remoteHash = assetSha256(asset);
	if (remoteHash) {
		const available = remoteHash !== installed.sha256;
		return {
			installed,
			latestTag: release.tag_name,
			assetName: asset.name,
			updateAvailable: available,
			reason: available
				? "Release file hash differs from the installed jar."
				: "Installed jar hash matches the latest release.",
		};
	}
	const available =
		installed.tag !== release.tag_name ||
		installed.assetName !== asset.name;
	return {
		installed,
		latestTag: release.tag_name,
		assetName: asset.name,
		updateAvailable: available,
		reason: available
			? "Release tag differs (GitHub exposed no file hash to compare)."
			: "Already on the latest release tag.",
	};
}

// ─── Install / sync (side effects) ────────────────────────────────────────────

export type SyncStatus =
	| "installed"
	| "updated"
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
	sha256?: string;
	message?: string;
}

/**
 * Ensure the newest connector jar from GitHub is installed in `pluginDir` for
 * `serverId`, tracking the installed version + hash.
 *
 * The download is skipped entirely when the installed jar is already current
 * (decided by {@link checkForUpdate}'s logic), so this is cheap to call on
 * every startup / server start.
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

	const prev = await getConnectorState(serverId);
	const remoteHash = assetSha256(asset);
	const fileOnDisk = prev ? existsSync(prev.filePath) : false;

	// Fast path: up to date according to the hash (or tag) — no download.
	if (!force && prev && fileOnDisk) {
		const current = remoteHash
			? remoteHash === prev.sha256
			: prev.tag === release.tag_name && prev.assetName === asset.name;
		if (current) {
			return {
				status: "upToDate",
				tag: prev.tag,
				assetName: prev.assetName,
				sha256: prev.sha256,
			};
		}
	}

	// Download the asset.
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
	const hash = sha256Hex(buf);

	// Content-identical to what we already have: refresh bookkeeping only.
	if (!force && prev && prev.sha256 === hash && fileOnDisk) {
		if (prev.tag !== release.tag_name || prev.assetId !== asset.id) {
			await store.set<ConnectorState>(stateKey(serverId), {
				...prev,
				tag: release.tag_name,
				assetId: asset.id,
			});
		}
		return {
			status: "upToDate",
			tag: release.tag_name,
			assetName: asset.name,
			sha256: hash,
		};
	}

	// Remove the previous jar if the file name changed, to avoid duplicates.
	if (
		prev &&
		prev.assetName !== asset.name &&
		existsSync(prev.filePath)
	) {
		await rm(prev.filePath).catch(() => {});
	}

	if (!existsSync(pluginDir)) {
		await mkdir(pluginDir, { recursive: true });
	}
	const filePath = createPathForPluginFile(pluginDir, asset.name);
	await writeFile(filePath, buf);

	const newState: ConnectorState = {
		tag: release.tag_name,
		sha256: hash,
		assetName: asset.name,
		assetId: asset.id,
		filePath,
		installedAt: Date.now(),
	};
	await store.set<ConnectorState>(stateKey(serverId), newState);

	return {
		status: prev ? "updated" : "installed",
		tag: release.tag_name,
		assetName: asset.name,
		fromTag: prev?.tag,
		sha256: hash,
	};
}
