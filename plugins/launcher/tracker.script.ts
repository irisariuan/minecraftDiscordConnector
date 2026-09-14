import {
	announceRestartIfPending,
	isGitRepo,
	isUnderLauncher,
	launcherPid,
	refreshRemoteStatus,
	TAG,
} from "./lib";

const DEFAULT_FETCH_INTERVAL_MINUTES = 15;

/**
 * Startup wiring for the launcher plugin:
 * 1. report whether in-place restarts are available,
 * 2. notify whoever requested the last restart that the bot is back,
 * 3. periodically fetch the remote and log when upstream has new commits.
 *
 * `LAUNCHER_FETCH_INTERVAL_MINUTES` overrides the polling interval; `0` disables it.
 */
export default async function run() {
	if (!(await isGitRepo())) {
		console.warn(`${TAG} not a git repository; remote tracking disabled`);
		return;
	}
	console.log(
		isUnderLauncher()
			? `${TAG} running under launcher pid ${launcherPid() ?? "?"}; /launcher restart is available`
			: `${TAG} not running under the launcher; /launcher restart is unavailable (start with \`bun run start\`)`,
	);

	void announceRestartIfPending().catch((err) =>
		console.error(`${TAG} failed to announce restart:`, err),
	);

	const raw = process.env.LAUNCHER_FETCH_INTERVAL_MINUTES;
	const minutes =
		raw === undefined ? DEFAULT_FETCH_INTERVAL_MINUTES : Number(raw);
	if (!Number.isFinite(minutes) || minutes <= 0) {
		console.log(`${TAG} remote polling disabled`);
		return;
	}
	const tick = () =>
		refreshRemoteStatus().catch((err) =>
			console.error(`${TAG} remote check failed:`, err),
		);
	void tick();
	setInterval(tick, minutes * 60 * 1000);
}
