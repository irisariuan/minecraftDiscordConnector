/**
 * Apply the ports recorded in the database to each Minecraft server's
 * `server.properties`.
 *
 * Nothing in the launch path passes a port to the JVM: the server binds
 * whatever `server-port` says, while the bot's records drive port-conflict
 * checks and the proxy's dial target. Servers registered before `/mcserver
 * create` and `/mcserver edit` started writing the file can therefore disagree
 * with their own record — this backfill settles it in the record's favour.
 *
 * Only the `server-port` line is touched; comments, key order and line endings
 * are preserved. It is idempotent: files already on the right port are reported
 * as unchanged.
 *
 * A server only reads the file at startup, and a *running* server can rewrite
 * it from memory — so stop the affected servers first, or restart them after.
 *
 * Usage:  bun tools/backfill-server-port.ts [--dry-run]
 */
import { prisma } from "../lib/prisma";
import {
	SERVER_PROPERTIES_FILE,
	writeServerPort,
} from "../plugins/minecraft/runtime/serverProperties";

const DRY_RUN = process.argv.includes("--dry-run");
const MINECRAFT_PLUGIN_ID = "minecraft";

async function main() {
	const servers = await prisma.server.findMany();
	let written = 0;
	let unchanged = 0;
	let skipped = 0;
	let failed = 0;

	for (const server of servers) {
		const label = `#${server.id} ${server.tag ?? "(untagged)"}`;

		if (server.pluginId !== MINECRAFT_PLUGIN_ID) {
			skipped++;
			continue;
		}

		const port = server.port[0];
		if (typeof port !== "number") {
			console.warn(`${label}: no port recorded — skipped.`);
			skipped++;
			continue;
		}

		const result = await writeServerPort(server.path, port, {
			dryRun: DRY_RUN,
		});

		if (!result.ok) {
			console.error(
				`${label}: could not write ${SERVER_PROPERTIES_FILE} in ${server.path} — ${result.error}`,
			);
			failed++;
			continue;
		}

		if (result.action === "unchanged") {
			console.log(`${label}: already server-port=${port}.`);
			unchanged++;
			continue;
		}

		const from =
			result.action === "created"
				? `no ${SERVER_PROPERTIES_FILE}`
				: `server-port=${result.previous ?? "unset"}`;
		console.log(
			`${label}: ${from} → server-port=${port}${DRY_RUN ? " (dry run)" : ""}`,
		);
		written++;
	}

	console.log(
		`\nDone. ${written} file(s) ${DRY_RUN ? "would be " : ""}written, ` +
			`${unchanged} already correct, ${skipped} skipped, ${failed} failed.`,
	);
	await prisma.$disconnect();
	if (failed > 0) process.exitCode = 1;
}

main().catch(async (err) => {
	console.error("Backfill failed:", err);
	await prisma.$disconnect();
	process.exit(1);
});
