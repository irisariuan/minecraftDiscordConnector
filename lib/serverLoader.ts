import { getAllPaperVersions } from "./serverInstance/jar";

// ─── Version Option Fetching ──────────────────────────────────────────────────

interface MojangVersion {
	id: string;
	type: "release" | "snapshot" | "old_beta" | "old_alpha";
}

interface MojangVersionManifest {
	versions: MojangVersion[];
}

async function fetchMojangReleaseVersions(): Promise<string[] | null> {
	const res = await fetch(
		"https://launchermeta.mojang.com/mc/game/version_manifest.json",
	).catch(() => null);
	if (!res?.ok) return null;
	const data = (await res.json()) as MojangVersionManifest;
	return data.versions.filter((v) => v.type === "release").map((v) => v.id);
}

/**
 * Fetch up to 25 recent version strings for the given loader type, suitable
 * for populating a Discord `StringSelectMenu`.
 *
 * | Loader family | Source |
 * |---|---|
 * | `paper`, `folia`, `waterfall`, `velocity` | PaperMC v3 API |
 * | `fabric`, `quilt` | FabricMC meta API |
 * | Everything else | Mojang version manifest (release builds only) |
 *
 * Returns an empty array when `loaderType` is blank or all upstream APIs are
 * unreachable.
 */
export async function fetchVersionOptionsForLoader(
	loaderType: string,
): Promise<Array<{ label: string; value: string }>> {
	if (!loaderType) return [];
	const normalized = loaderType.toLowerCase().trim();

	// ── PaperMC loaders ───────────────────────────────────────────────────────
	if (PAPERMC_LOADERS.has(normalized)) {
		const data = await getAllPaperVersions(normalized);
		if (!data) return [];
		return data.versions
			.slice(0, 25)
			.map((v) => ({ label: v.version.id, value: v.version.id }));
	}

	// ── FabricMC loaders ──────────────────────────────────────────────────────
	if (FABRICMC_LOADERS.has(normalized)) {
		const data = await fetchFabricGameVersions();
		if (!data) return [];
		return data
			.filter((v) => v.stable)
			.slice(0, 25)
			.map((v) => ({ label: v.version, value: v.version }));
	}

	// ── Fallback: Mojang release versions ─────────────────────────────────────
	const versions = await fetchMojangReleaseVersions();
	if (!versions) return [];
	return versions.slice(0, 25).map((v) => ({ label: v, value: v }));
}

// ─── Loader → Mod Type Mapping ────────────────────────────────────────────────

const LOADER_MOD_TYPE: Record<string, string> = {
	paper: "plugin",
	folia: "plugin",
	spigot: "plugin",
	bukkit: "plugin",
	purpur: "plugin",
	pufferfish: "plugin",
	waterfall: "plugin",
	velocity: "plugin",
	fabric: "mod",
	forge: "mod",
	neoforge: "mod",
	quilt: "mod",
	vanilla: "none",
};

/** All recognised loader type names, in definition order. */
export const KNOWN_LOADERS = Object.keys(LOADER_MOD_TYPE);

/**
 * Infer the mod type from a loader type string.
 * Falls back to `"none"` for unrecognised loaders.
 */
export function inferModType(loaderType: string): string {
	return LOADER_MOD_TYPE[loaderType.toLowerCase().trim()] ?? "none";
}

// ─── Version Validation ───────────────────────────────────────────────────────

/** Loaders whose versions can be validated via the PaperMC v3 API. */
const PAPERMC_LOADERS = new Set(["paper", "folia", "velocity", "waterfall"]);

/** Loaders whose versions can be validated via the FabricMC meta API. */
const FABRICMC_LOADERS = new Set(["fabric", "quilt"]);

/** Accepts X.Y and X.Y.Z, with an optional pre-release suffix. */
const VERSION_RE = /^\d+\.\d+(\.\d+)?(-\S+)?$/;

interface FabricGameVersion {
	version: string;
	stable: boolean;
}

async function fetchFabricGameVersions(): Promise<FabricGameVersion[] | null> {
	const res = await fetch("https://meta.fabricmc.net/v2/versions/game").catch(
		() => null,
	);
	if (!res?.ok) return null;
	return res.json() as Promise<FabricGameVersion[]>;
}

/**
 * Validate a game-version string against the canonical version list for the
 * given loader type.
 *
 * | Loader family | Source |
 * |---|---|
 * | `paper`, `folia`, `velocity`, `waterfall` | PaperMC v3 API |
 * | `fabric`, `quilt` | FabricMC meta API |
 * | Everything else | `X.Y` / `X.Y.Z` pattern check only |
 *
 * If the upstream API is unreachable the function returns `null` (valid) rather
 * than blocking server creation.
 *
 * @returns An error string suitable for embedding in a Discord message, or
 *          `null` when the version is acceptable.
 */
export async function validateVersionForLoader(
	version: string,
	loaderType: string,
): Promise<string | null> {
	const normalized = loaderType.toLowerCase().trim();

	// ── Pattern check (all loaders) ───────────────────────────────────────────
	if (!VERSION_RE.test(version)) {
		return "Version must follow the `X.Y` or `X.Y.Z` format (e.g. `1.21.1`).";
	}

	// ── PaperMC loaders ───────────────────────────────────────────────────────
	if (PAPERMC_LOADERS.has(normalized)) {
		const data = await getAllPaperVersions(normalized);
		if (data) {
			const valid = data.versions.map((v) => v.version.id);
			if (!valid.includes(version)) {
				const recent = [...valid].reverse().slice(0, 5);
				return (
					`Version \`${version}\` is not available for **${loaderType}**. ` +
					`Recent versions: ${recent.map((v) => `\`${v}\``).join(", ")}.`
				);
			}
		}
		// API unavailable — don't block
		return null;
	}

	// ── FabricMC loaders ──────────────────────────────────────────────────────
	if (FABRICMC_LOADERS.has(normalized)) {
		const data = await fetchFabricGameVersions();
		if (data) {
			if (!data.find((v) => v.version === version)) {
				const recent = data
					.filter((v) => v.stable)
					.slice(0, 5)
					.map((v) => v.version);
				return (
					`Version \`${version}\` is not available for **${loaderType}**. ` +
					`Recent stable versions: ${recent.map((v) => `\`${v}\``).join(", ")}.`
				);
			}
		}
		return null;
	}

	// ── Unknown loader — pattern check already passed ─────────────────────────
	return null;
}
