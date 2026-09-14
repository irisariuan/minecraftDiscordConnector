/**
 * Bot launcher — keeps the bot attached to the *current* terminal across
 * restarts.
 *
 * Usage: `bun plugins/launcher/launcher.ts [bot args…]` (or `bun run start`).
 *
 * The launcher spawns `index.ts` as a child that inherits this process's
 * stdin/stdout/stderr, so console output and the interactive console keep
 * working in the same window. When the bot exits with
 * {@link RESTART_EXIT_CODE} (e.g. via `/launcher restart`) it is spawned again
 * in place; any other exit code is passed through and the launcher exits.
 *
 * This file is intentionally not matched by the plugin globs and must not
 * import from `plugins/api.ts` — it runs before the bot exists.
 */
import { resolve } from "node:path";
import {
	LAUNCHER_ENV_KEY,
	LAUNCHER_PID_ENV_KEY,
	RESTART_EXIT_CODE,
} from "./protocol";

const TAG = "[launcher]";
const RESTART_DELAY_MS = 1000;

const root = resolve(import.meta.dir, "../..");
const entry = resolve(root, "index.ts");
const botArgs = process.argv.slice(2);

let child: ReturnType<typeof Bun.spawn> | null = null;
let shuttingDown = false;
let runs = 0;

// Ctrl-C is delivered by the terminal to the whole foreground process group,
// so the bot already receives it; we only need to remember not to restart.
process.on("SIGINT", () => {
	shuttingDown = true;
});
// SIGTERM/SIGHUP are usually sent to this pid only, so forward them.
for (const signal of ["SIGTERM", "SIGHUP"] as const) {
	process.on(signal, () => {
		shuttingDown = true;
		child?.kill(signal);
	});
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

console.log(
	`${TAG} pid ${process.pid} — bot restarts in place when it exits with code ${RESTART_EXIT_CODE}`,
);

while (true) {
	runs++;
	if (runs > 1) console.log(`${TAG} restarting bot (run #${runs})…`);

	child = Bun.spawn({
		cmd: [process.execPath, entry, ...botArgs],
		cwd: root,
		stdio: ["inherit", "inherit", "inherit"],
		env: {
			...process.env,
			[LAUNCHER_ENV_KEY]: "1",
			[LAUNCHER_PID_ENV_KEY]: String(process.pid),
		},
	});

	const code = await child.exited;
	child = null;

	if (code === RESTART_EXIT_CODE && !shuttingDown) {
		await sleep(RESTART_DELAY_MS);
		continue;
	}
	if (code === RESTART_EXIT_CODE) {
		console.log(`${TAG} restart requested during shutdown; exiting instead`);
	}
	process.exit(code);
}
