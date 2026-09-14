import { $ } from "bun";
import type { Client, ChatInputCommandInteraction } from "discord.js";
import { createStore, safeFetch, type ServerManager } from "../api";
import {
	LAUNCHER_ENV_KEY,
	LAUNCHER_PID_ENV_KEY,
	RESTART_EXIT_CODE,
} from "./protocol";
import {
	runPipeline,
	type PipelineContext,
	type PipelineMode,
	type PipelineReason,
	type PipelineRun,
} from "./pipeline";

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
	if (!isSafeRefInput(name)) return false;
	return (await git("check-ref-format", "--branch", name)).ok;
}

/**
 * Cheap shape check before a user-supplied string reaches git at all.
 *
 * Anything that survives this is still only ever passed as a single argument
 * after `--`, or resolved to a hex sha first; this rejects the shapes that
 * would be read as options or ranges rather than as one revision.
 */
function isSafeRefInput(input: string): boolean {
	if (!input || input.length > 200) return false;
	if (input.startsWith("-")) return false;
	if (/\s/.test(input)) return false;
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001f\u007f]/.test(input)) return false;
	if (input.includes("..")) return false;
	if (input.includes(":")) return false;
	return true;
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

/** Tag names, newest first. */
export async function listTags(limit = 50): Promise<string[]> {
	const res = await git(
		"for-each-ref",
		"--sort=-creatordate",
		`--count=${limit}`,
		"--format=%(refname:short)",
		"refs/tags",
	);
	return res.ok ? res.stdout.split("\n").filter((l) => l.length > 0) : [];
}

/** Recent commits reachable from any branch, for `/launcher switch` suggestions. */
export async function listRecentCommits(limit = 20): Promise<CommitInfo[]> {
	const res = await git(
		"log",
		"--all",
		`--max-count=${limit}`,
		"--format=%H%x1f%h%x1f%s%x1f%cI",
	);
	if (!res.ok) return [];
	return res.stdout
		.split("\n")
		.filter((l) => l.length > 0)
		.map((line) => {
			const [sha = "", shortSha = "", subject = "", date = ""] = line.split("\x1f");
			return { sha, shortSha, subject, date };
		});
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

// ─── Targets ──────────────────────────────────────────────────────────────────

/**
 * What `/launcher switch` was pointed at. A branch keeps the checkout on a
 * branch; anything else — a tag, a sha, `HEAD~2` — is checked out detached,
 * which is the normal way to run a specific commit.
 */
export interface ResolvedTarget {
	kind: "localBranch" | "remoteBranch" | "commit";
	/** Exactly what the user typed. */
	input: string;
	/** Branch to end up on, or null for a detached checkout. */
	branch: string | null;
	/** Remote-tracking ref a new local branch is created from. */
	remoteRef: string | null;
	sha: string;
	shortSha: string;
	subject: string;
}

export type TargetResolution =
	| { status: "ok"; target: ResolvedTarget }
	| { status: "invalidName" }
	| { status: "notFound" };

/**
 * Work out what a user-supplied string refers to, preferring branches so the
 * common case never lands in detached HEAD by accident:
 *
 * 1. a local branch → switch to it
 * 2. a branch that only exists on a remote → create it as a tracking branch
 * 3. anything git can resolve to a commit (tag, sha, `HEAD~2`) → detached
 */
export async function resolveTarget(input: string): Promise<TargetResolution> {
	if (!isSafeRefInput(input)) return { status: "invalidName" };

	const branches = await listBranches();
	const isLocal = branches.local.includes(input);
	const remoteRef = isLocal ? null : (branches.remote.get(input) ?? null);

	// For a branch, resolve through the ref that will actually be checked out;
	// for a remote-only branch that is the remote-tracking ref.
	const revArg = remoteRef ?? input;
	const rev = await git("rev-parse", "--verify", "--quiet", `${revArg}^{commit}`);
	if (!rev.ok || !/^[0-9a-f]{40}$/.test(rev.stdout)) {
		if (isLocal || remoteRef) {
			// A branch git listed but cannot resolve is a broken ref, not a typo.
			return { status: "notFound" };
		}
		return { status: "notFound" };
	}
	const commit = await readCommit(rev.stdout);

	return {
		status: "ok",
		target: {
			kind: isLocal ? "localBranch" : remoteRef ? "remoteBranch" : "commit",
			input,
			branch: isLocal || remoteRef ? input : null,
			remoteRef,
			sha: rev.stdout,
			shortSha: commit?.shortSha ?? rev.stdout.slice(0, 7),
			subject: commit?.subject ?? "",
		},
	};
}

// ─── Pipeline plumbing ────────────────────────────────────────────────────────

function describeRef(status: GitStatus): string {
	if (status.detached) return status.head?.shortSha ?? "HEAD";
	return status.branch;
}

function pipelineContext(
	reason: PipelineReason,
	from: { ref: string; sha: string },
	to: { ref: string; sha: string },
): PipelineContext {
	return {
		reason,
		fromRef: from.ref,
		fromSha: from.sha,
		toRef: to.ref,
		toSha: to.sha,
	};
}

/**
 * Run the pipeline by hand against the current checkout, for `/launcher
 * pipeline apply|unapply`. From and to are both HEAD: nothing is moving, the
 * operator is re-running or undoing the steps for the version already here.
 */
export async function runPipelineManually(
	mode: PipelineMode,
): Promise<PipelineRun> {
	const status = await readGitStatus();
	const here = { ref: describeRef(status), sha: status.head?.sha ?? "HEAD" };
	return runPipeline(mode, pipelineContext("manual", here, here));
}

// ─── Switch ───────────────────────────────────────────────────────────────────

export type SwitchResult =
	| {
			status: "switched";
			from: string;
			to: string;
			target: ResolvedTarget;
			deps: DepsOutcome;
			unapply: PipelineRun | null;
			apply: PipelineRun | null;
	  }
	| { status: "alreadyOn"; target: string }
	| { status: "dirty"; files: number }
	| { status: "invalidName" }
	| { status: "notFound"; target: string }
	| { status: "unapplyFailed"; run: PipelineRun }
	| { status: "error"; message: string };

/**
 * Check out `input` — a branch, a tag, or a commit — and move the host's side
 * effects with it.
 *
 * The order is what makes the pipeline reversible: the version being left is
 * unapplied **before** the checkout, while its own steps are still the ones in
 * the working tree, and the version being moved to is applied after. A failed
 * unapply aborts the switch entirely rather than stranding the host between
 * two versions.
 *
 * Refuses to run on a dirty working tree so local edits are never carried
 * across or lost.
 */
export async function switchVersion(
	input: string,
	options: { pipeline?: boolean } = {},
): Promise<SwitchResult> {
	const usePipeline = options.pipeline ?? true;

	const resolution = await resolveTarget(input);
	if (resolution.status === "invalidName") return { status: "invalidName" };
	if (resolution.status === "notFound") return { status: "notFound", target: input };
	const { target } = resolution;

	const before = await readGitStatus();
	const fromSha = before.head?.sha ?? "HEAD";
	const alreadyOn =
		target.branch !== null
			? !before.detached && before.branch === target.branch
			: before.detached && fromSha === target.sha;
	if (alreadyOn) return { status: "alreadyOn", target: input };

	if (before.dirtyFiles > 0) return { status: "dirty", files: before.dirtyFiles };

	const ctx = pipelineContext(
		"switch",
		{ ref: describeRef(before), sha: fromSha },
		{ ref: target.branch ?? target.shortSha, sha: target.sha },
	);

	let unapply: PipelineRun | null = null;
	if (usePipeline) {
		unapply = await runPipeline("unapply", ctx);
		if (!unapply.ok) return { status: "unapplyFailed", run: unapply };
	}

	const res = target.remoteRef
		? await git("switch", "--track", "--", target.remoteRef)
		: target.branch
			? await git("switch", "--", target.branch)
			: // A resolved sha, never the raw input.
				await git("switch", "--detach", target.sha);
	if (!res.ok) {
		return {
			status: "error",
			message: res.stderr || `git switch exited with ${res.code}`,
		};
	}

	const after = await readGitStatus();
	const deps = await refreshDepsIfNeeded(fromSha, after.head?.sha ?? "HEAD");
	const apply = usePipeline ? await runPipeline("apply", ctx) : null;

	return {
		status: "switched",
		from: describeRef(before),
		to: target.branch ?? target.shortSha,
		target,
		deps,
		unapply,
		apply,
	};
}

// ─── Pull ─────────────────────────────────────────────────────────────────────

export type PullResult =
	| { status: "upToDate"; branch: string }
	| {
			status: "updated";
			branch: string;
			from: CommitInfo | null;
			to: CommitInfo | null;
			commits: number;
			deps: DepsOutcome;
			unapply: PipelineRun | null;
			apply: PipelineRun | null;
	  }
	| { status: "noUpstream"; branch: string }
	| { status: "dirty"; files: number }
	| { status: "unapplyFailed"; run: PipelineRun }
	| { status: "error"; message: string };

/**
 * Fast-forward the current branch to its upstream. Never merges or rebases.
 *
 * A fast-forward is a version change like any other, so it runs the same
 * unapply → move → apply pipeline as `/launcher switch`.
 */
export async function pullFastForward(
	options: { pipeline?: boolean } = {},
): Promise<PullResult> {
	const usePipeline = options.pipeline ?? true;

	const before = await readGitStatus({ fetch: true });
	if (before.fetchError) return { status: "error", message: before.fetchError };
	if (!before.upstream) return { status: "noUpstream", branch: before.branch };
	if (before.behind === 0) return { status: "upToDate", branch: before.branch };
	if (before.dirtyFiles > 0) return { status: "dirty", files: before.dirtyFiles };

	const targetRes = await git("rev-parse", "--verify", "--quiet", "@{u}^{commit}");
	const ctx = pipelineContext(
		"pull",
		{ ref: before.branch, sha: before.head?.sha ?? "HEAD" },
		{
			ref: before.upstream,
			sha: targetRes.ok ? targetRes.stdout : (before.remoteHead?.sha ?? "@{u}"),
		},
	);

	let unapply: PipelineRun | null = null;
	if (usePipeline) {
		unapply = await runPipeline("unapply", ctx);
		if (!unapply.ok) return { status: "unapplyFailed", run: unapply };
	}

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
	const apply = usePipeline ? await runPipeline("apply", ctx) : null;

	return {
		status: "updated",
		branch: before.branch,
		from: before.head,
		to: after.head,
		commits: before.behind,
		deps,
		unapply,
		apply,
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
