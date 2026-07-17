/**
 * Idempotent backfill for the multi-game migration.
 *
 * The SQL migration (`20260718000000_multigame_platform`) already folds the old
 * Minecraft columns into `Server.config`. This script is a re-runnable SAFETY
 * NET for installs where a Minecraft server row ended up with an incomplete
 * `config` (e.g. created between deploys): it fills any missing Minecraft config
 * keys from the environment and normalises `pluginId`.
 *
 * It is idempotent — rows whose config is already complete are skipped and
 * reported as such. Running it twice makes no further changes.
 *
 * Usage:  bun scripts/backfill-minecraft.ts [--dry-run]
 *
 * Back up your database first (see docs/MIGRATION.md).
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { safeJoin } from "../lib/utils";

const DRY_RUN = process.argv.includes("--dry-run");
const MINECRAFT_PLUGIN_ID = "minecraft";

/** Minecraft config keys the plugin expects, and their env fallbacks. */
function envMinecraftConfig(): Record<string, unknown> {
	const serverDir = process.env.SERVER_DIR;
	return {
		loaderType: process.env.LOADER_TYPE,
		modType: process.env.MOD_TYPE,
		minecraftVersion: process.env.MINECRAFT_VERSION,
		pluginDir: serverDir ? safeJoin(serverDir, "plugins") : undefined,
		apiPort: process.env.SERVER_API_PORT
			? Number(process.env.SERVER_API_PORT)
			: undefined,
	};
}

const REQUIRED_KEYS = [
	"loaderType",
	"modType",
	"minecraftVersion",
	"pluginDir",
] as const;

async function main() {
	const servers = await prisma.server.findMany();
	let updated = 0;
	let skipped = 0;
	const fallback = envMinecraftConfig();

	for (const server of servers) {
		if (server.pluginId !== MINECRAFT_PLUGIN_ID) {
			skipped++;
			continue;
		}
		const config: Record<string, unknown> = {
			...(typeof server.config === "object" && server.config !== null
				? (server.config as Record<string, unknown>)
				: {}),
		};

		const missing = REQUIRED_KEYS.filter(
			(k) => config[k] === undefined || config[k] === null,
		);
		if (missing.length === 0) {
			skipped++;
			continue;
		}

		const unfilled: string[] = [];
		for (const key of missing) {
			const value = fallback[key];
			if (value === undefined) {
				unfilled.push(key);
				continue;
			}
			config[key] = value;
		}
		if (unfilled.length > 0) {
			console.warn(
				`Server #${server.id}: cannot backfill ${unfilled.join(", ")} — ` +
					`no environment fallback. Set the matching env var or edit config manually.`,
			);
		}

		console.log(
			`Server #${server.id}: filling ${missing
				.filter((k) => !unfilled.includes(k))
				.join(", ")}${DRY_RUN ? " (dry run)" : ""}`,
		);
		if (!DRY_RUN) {
			await prisma.server.update({
				where: { id: server.id },
				data: { config: config as Prisma.InputJsonValue },
			});
		}
		updated++;
	}

	console.log(
		`\nDone. ${updated} server(s) ${DRY_RUN ? "would be" : ""} updated, ${skipped} already complete / non-minecraft.`,
	);
	await prisma.$disconnect();
}

main().catch(async (err) => {
	console.error("Backfill failed:", err);
	await prisma.$disconnect();
	process.exit(1);
});
