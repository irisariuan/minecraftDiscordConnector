import { $ } from "bun";
import type { Client, ChatInputCommandInteraction } from "discord.js";
import { createStore, safeFetch, type ServerManager } from "../api";
import {
	LAUNCHER_ENV_KEY,
	LAUNCHER_PID_ENV_KEY,
	RESTART_EXIT_CODE,
} from "./protocol";

export { RESTART_EXIT_CODE } from "./protocol";

export const TAG = "[launcher]";
export const store = createStore("launcher");

// Interaction tokens are valid for 15 minutes; leave a margin.
const RESTART_ANNOUNCE_WINDOW_MS = 14 * 60 * 1000;

// ─── Launcher detection ───────────────────────────────────────────────────────

/** Whether this bot process was spawned by `plugins/launcher/launcher.ts`. */
export function isUnderLauncher(): boolean {
	return process.env[LAUNCHER_ENV_KEY] === "1";
}

export function launcherPid(): number | null {
	const raw = process.env[LAUNCHER_PID_ENV_KEY];
	const pid = raw ? Number(raw) : Number.NaN;
	return Number.isFinite(pid) ? pid : null;
}

// ─── Git plumbing ─────────────────────────────────────────────────────────────

export interface GitResult {
	ok: boolean;
	code: number;
	stdout: string;
	stderr: string;
}

/** Run `git` in the bot's working directory without ever prompting. */
export async function git(...args: string[]): Promise<GitResult> {
	const result = await $`git ${args}`
		.cwd(process.cwd())
		.env({ ...process.env, GIT_TERMINAL_PROMPT: "0" })
		.nothrow()
		.quiet();
	return {
		ok: result.exitCode === 0,
		code: result.exitCode,
		stdout: result.text().trim(),
		stderr: result.stderr.toString().trim(),
	};
}

export async function isGitRepo(): Promise<boolean> {
	const res = await git("rev-parse", "--is-inside-work-tree");
	return res.ok && res.stdout === "true";
}

function parseCount(raw: string): number {
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) ? n : 0;
}

/** Validate a user-supplied branch name before handing it to git. */
export async function isValidBranchName(name: string): Promise<boolean> {
	if (!name || name.startsWith("-")) return false;
	return (await git("check-ref-format", "--branch", name)).ok;
}

// ─── Status ───────────────────────────────────────────────────────────────────

export interface CommitInfo {
	sha: string;
	shortSha: string;
	subject: string;
	/** ISO-8601 committer date. */
	date: string;
}

export interface GitStatus {
	/** Current branch name, or "HEAD" when detached. */
	branch: string;
	detached: boolean;
	head: CommitInfo | null;
	/** e.g. "origin/main", or null when the branch tracks nothing. */
	upstream: string | null;
	remoteHead: CommitInfo | null;
	ahead: number;
	behind: number;
	/** Number of modified/untracked paths in the working tree. */
	dirtyFiles: number;
	remoteUrl: string | null;
	/** Set when a fetch was attempted and failed. */
	fetchError: string | null;
}

async function readCommit(ref: string): Promise<CommitInfo | null> {
	const res = await git("log", "-1", "--format=%H%n%h%n%s%n%cI", ref, "--");
	if (!res.ok) return null;
	const [sha = "", shortSha = "", subject = "", date = ""] =
		res.stdout.split("\n");
	return { sha, shortSha, subject, date };
}

/**
 * Snapshot the repository's relationship to its remote. With `fetch: true` the
 * remote is contacted first; otherwise the last fetched state is reported.
 */
export async function readGitStatus(
	options: { fetch?: boolean } = {},
): Promise<GitStatus> {
	let fetchError: string | null = null;
	if (options.fetch) {
		const fetched = await git("fetch", "--prune", "--quiet");
		if (!fetched.ok) {
			fetchError = fetched.stderr || `git fetch exited with ${fetched.code}`;
		}
	}

	const branchRes = await git("rev-parse", "--abbrev-ref", "HEAD");
	const branch = branchRes.ok ? branchRes.stdout : "HEAD";
	const detached = branch === "HEAD";

	const upstreamRes = await git(
		"rev-parse",
		"--abbrev-ref",
		"--symbolic-full-name",
		"@{u}",
	);
	const upstream = upstreamRes.ok ? upstreamRes.stdout : null;

	let ahead = 0;
	let behind = 0;
	let remoteHead: CommitInfo | null = null;
	if (upstream) {
		const counts = await git(
			"rev-list",
			"--left-right",
			"--count",
			"HEAD...@{u}",
		);
		if (counts.ok) {
			const [a = "0", b = "0"] = counts.stdout.split(/\s+/);
			ahead = parseCount(a);
			behind = parseCount(b);
		}
		remoteHead = await readCommit("@{u}");
	}

	const dirty = await git("status", "--porcelain", "--untracked-files=normal");
	const dirtyFiles = dirty.ok
		? dirty.stdout.split("\n").filter((l) => l.length > 0).length
		: 0;

	const remote = await git("remote", "get-url", "origin");

	return {
		branch,
		detached,
		head: await readCommit("HEAD"),
		upstream,
		remoteHead,
		ahead,
		behind,
		dirtyFiles,
		remoteUrl: remote.ok ? remote.stdout : null,
		fetchError,
	};
}

/** Last background/remote check, persisted so `/launcher status` can show it. */
export interface RemoteCheck {
	at: number;
	branch: string;
	upstream: string | null;
	ahead: number;
	behind: number;
	remoteHeadSha: string | null;
	error: string | null;
}

/**
 * Fetch from the remote, persist the result, and log when new upstream commits
 * appear (once per new remote head).
 */
export async function refreshRemoteStatus(): Promise<RemoteCheck> {
	const status = await readGitStatus({ fetch: true });
	const check: RemoteCheck = {
		at: Date.now(),
		branch: status.branch,
		upstream: status.upstream,
		ahead: status.ahead,
		behind: status.behind,
		remoteHeadSha: status.remoteHead?.sha ?? null,
		error: status.fetchError,
	};
	await store.set("lastRemoteCheck", check);

	if (status.fetchError) {
		console.warn(`${TAG} git fetch failed: ${status.fetchError}`);
		return check;
	}

	const announced = await store.get<string>("announcedRemoteSha");
	if (
		status.behind > 0 &&
		status.remoteHead &&
		announced !== status.remoteHead.sha
	) {
		console.log(
			`${TAG} ${status.upstream} is ${status.behind} commit(s) ahead of local ${status.branch} ` +
				`(${status.remoteHead.shortSha} ${status.remoteHead.subject}). ` +
				`Use /launcher pull then /launcher restart to update.`,
		);
		await store.set("announcedRemoteSha", status.remoteHead.sha);
	}
	return check;
}

export function getLastRemoteCheck(): Promise<RemoteCheck | null> {
	return store.get<RemoteCheck>("lastRemoteCheck");
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export interface BranchList {
	current: string;
	local: string[];
	/** Remote-tracking branches, keyed by short branch name → "remote/name". */
	remote: Map<string, string>;
}

export async function listBranches(): Promise<BranchList> {
	const currentRes = await git("rev-parse", "--abbrev-ref", "HEAD");
	const current = currentRes.ok ? currentRes.stdout : "HEAD";

	const localRes = await git(
		"for-each-ref",
		"--format=%(refname:short)",
		"refs/heads",
	);
	const local = localRes.ok
		? localRes.stdout.split("\n").filter((l) => l.length > 0)
		: [];

	const remoteRes = await git(
		"for-each-ref",
		"--format=%(refname:short)",
		"refs/remotes",
	);
	const remote = new Map<string, string>();
	if (remoteRes.ok) {
		for (const ref of remoteRes.stdout.split("\n")) {
			const slash = ref.indexOf("/");
			if (slash < 0) continue;
			const name = ref.slice(slash + 1);
			if (!name || name === "HEAD") continue;
			if (!remote.has(name)) remote.set(name, ref);
		}
	}
	return { current, local, remote };
}

// ─── Dependency refresh ───────────────────────────────────────────────────────

/** Whether the dependency manifest changed between two commits. */
async function depsChangedBetween(from: string, to: string): Promise<boolean> {
	const res = await git(
		"diff",
		"--name-only",
		from,
		to,
		"--",
		"package.json",
		"bun.lock",
		"bun.lockb",
	);
	return res.ok && res.stdout.length > 0;
}

export async function runBunInstall(): Promise<{ ok: boolean; output: string }> {
	const result = await $`bun install`.cwd(process.cwd()).nothrow().quiet();
	const output = `${result.text()}\n${result.stderr.toString()}`.trim();
	return { ok: result.exitCode === 0, output };
}

/** Run `bun install` when `from`→`to` touched the dependency manifest. */
async function refreshDepsIfNeeded(
	from: string,
	to: string,
): Promise<"unchanged" | "installed" | "failed"> {
	if (!(await depsChangedBetween(from, to))) return "unchanged";
	console.log(`${TAG} dependencies changed; running bun install…`);
	const install = await runBunInstall();
	if (!install.ok) console.error(`${TAG} bun install failed:\n${install.output}`);
	return install.ok ? "installed" : "failed";
}

export type DepsOutcome = Awaited<ReturnType<typeof refreshDepsIfNeeded>>;

// ─── Switch ───────────────────────────────────────────────────────────────────

export type SwitchResult =
	| { status: "switched"; from: string; to: string; deps: DepsOutcome }
	| { status: "alreadyOn"; branch: string }
	| { status: "dirty"; files: number }
	| { status: "invalidName" }
	| { status: "notFound"; branch: string }
	| { status: "error"; message: string };

/**
 * Check out `name`. Local branches are switched to directly; a branch that
 * only exists on a remote is created as a tracking branch. Refuses to run on a
 * dirty working tree so local edits are never carried across or lost.
 */
export async function switchBranch(name: string): Promise<SwitchResult> {
	if (!(await isValidBranchName(name))) return { status: "invalidName" };

	const before = await readGitStatus();
	if (before.branch === name) return { status: "alreadyOn", branch: name };

	const branches = await listBranches();
	const remoteRef = branches.local.includes(name)
		? null
		: (branches.remote.get(name) ?? null);
	if (!branches.local.includes(name) && !remoteRef) {
		return { status: "notFound", branch: name };
	}
	if (before.dirtyFiles > 0) return { status: "dirty", files: before.dirtyFiles };

	const fromSha = before.head?.sha ?? "HEAD";
	const res = remoteRef
		? await git("switch", "--track", "--", remoteRef)
		: await git("switch", "--", name);
	if (!res.ok) {
		return {
			status: "error",
			message: res.stderr || `git switch exited with ${res.code}`,
		};
	}

	const after = await readGitStatus();
	const deps = await refreshDepsIfNeeded(fromSha, after.head?.sha ?? "HEAD");
	return { status: "switched", from: before.branch, to: name, deps };
}

// ─── Pull ─────────────────────────────────────────────────────────────────────

export type PullResult =
	| { status: "upToDate"; branch: string }
	| { status: "updated"; branch: string; from: CommitInfo | null; to: CommitInfo | null; commits: number; deps: DepsOutcome }
	| { status: "noUpstream"; branch: string }
	| { status: "dirty"; files: number }
	| { status: "error"; message: string };

/** Fast-forward the current branch to its upstream. Never merges or rebases. */
export async function pullFastForward(): Promise<PullResult> {
	const before = await readGitStatus({ fetch: true });
	if (before.fetchError) return { status: "error", message: before.fetchError };
	if (!before.upstream) return { status: "noUpstream", branch: before.branch };
	if (before.behind === 0) return { status: "upToDate", branch: before.branch };
	if (before.dirtyFiles > 0) return { status: "dirty", files: before.dirtyFiles };

	const res = await git("merge", "--ff-only", "--quiet", "@{u}");
	if (!res.ok) {
		return {
			status: "error",
			message: res.stderr || `git merge --ff-only exited with ${res.code}`,
		};
	}
	const after = await readGitStatus();
	const deps = await refreshDepsIfNeeded(
		before.head?.sha ?? "HEAD",
		after.head?.sha ?? "HEAD",
	);
	return {
		status: "updated",
		branch: before.branch,
		from: before.head,
		to: after.head,
		commits: before.behind,
		deps,
	};
}

// ─── Restart ──────────────────────────────────────────────────────────────────

interface PendingRestart {
	applicationId: string;
	token: string;
	requestedAt: number;
	userId: string;
	branch: string;
}

/**
 * Stop every managed game server, remember who asked, and exit with the
 * restart code so the launcher spawns a fresh bot in the same terminal.
 * Never resolves: the process exits.
 */
export async function requestRestart(params: {
	interaction: ChatInputCommandInteraction;
	client: Client;
	serverManager: ServerManager;
}): Promise<never> {
	const { interaction, client, serverManager } = params;
	const status = await readGitStatus();
	const pending: PendingRestart = {
		applicationId: interaction.applicationId,
		token: interaction.token,
		requestedAt: Date.now(),
		userId: interaction.user.id,
		branch: status.branch,
	};
	await store.set("pendingRestart", pending);

	console.log(
		`${TAG} restart requested by ${interaction.user.tag} (${interaction.user.id}); stopping servers…`,
	);
	await serverManager
		.exitAllServers(client)
		.catch((err) => console.error(`${TAG} error stopping servers:`, err));
	console.log(`${TAG} exiting with code ${RESTART_EXIT_CODE} for the launcher`);
	process.exit(RESTART_EXIT_CODE);
}

/**
 * After a restart, tell the requester the bot is back by following up on
 * their original interaction. Uses the interaction webhook, so it works
 * before the gateway client has logged in.
 */
export async function announceRestartIfPending(): Promise<void> {
	const pending = await store.get<PendingRestart>("pendingRestart");
	if (!pending) return;
	await store.delete("pendingRestart");

	const elapsedMs = Date.now() - pending.requestedAt;
	const seconds = Math.max(1, Math.round(elapsedMs / 1000));
	console.log(
		`${TAG} back online after restart requested by ${pending.userId} (${seconds}s ago)`,
	);
	if (elapsedMs > RESTART_ANNOUNCE_WINDOW_MS) return;

	const status = await readGitStatus();
	const head = status.head
		? ` on \`${status.branch}\` @ \`${status.head.shortSha}\``
		: "";
	await safeFetch(
		`https://discord.com/api/v10/webhooks/${pending.applicationId}/${pending.token}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				content: `✅ Bot restarted and is back online${head} (took ~${seconds}s).`,
				flags: 64,
			}),
		},
		false,
		10_000,
	);
}
