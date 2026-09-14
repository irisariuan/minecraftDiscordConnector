/**
 * The version pipeline: ordered steps that bring the host's side effects in
 * line with whichever commit is checked out.
 *
 * A checkout only moves files. Anything a version needs *done* — compiling the
 * Go proxy, applying database migrations, rebuilding the web UI — has to run
 * around it, and has to be undone when moving away again. Those steps live in
 * `.launcher/pipeline/` as numbered files:
 *
 * ```
 * .launcher/pipeline/10-install.sh
 * .launcher/pipeline/20-build-proxy.sh
 * .launcher/pipeline/30-migrate.ts
 * ```
 *
 * Each file is one step and handles both directions: it is invoked with
 * `apply` or `unapply` as its first argument (and `LAUNCHER_PIPELINE_MODE` in
 * the environment). Apply runs the steps in ascending filename order; unapply
 * runs them in reverse, so a step is always torn down before anything it was
 * built on top of. A step with nothing to undo just exits 0 on `unapply`.
 *
 * The whole directory is optional. With no `.launcher/pipeline/`, every
 * launcher operation behaves exactly as it did before this module existed.
 *
 * Steps run against the *checked-out* tree, which is what makes unapply work:
 * `/launcher switch` unapplies from the old version's steps **before** the
 * checkout, then applies the new version's steps after it.
 */
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createStore } from "../api";

const TAG = "[launcher:pipeline]";
const store = createStore("launcher");

/** Where steps live, relative to the bot's working directory. */
const DEFAULT_DIR = ".launcher/pipeline";
/** A step that runs longer than this is killed and the run fails. */
const STEP_TIMEOUT_MS = 10 * 60 * 1000;
/** Per-step output kept in memory; enough to diagnose, bounded for Discord. */
const MAX_STEP_OUTPUT = 8000;

export type PipelineMode = "apply" | "unapply";
export type PipelineReason = "switch" | "pull" | "manual";

export interface PipelineContext {
	reason: PipelineReason;
	fromSha: string;
	toSha: string;
	fromRef: string;
	toRef: string;
}

export interface StepRun {
	step: string;
	ok: boolean;
	code: number;
	output: string;
	durationMs: number;
	timedOut: boolean;
	/** Set when the step was not executed at all, with the reason. */
	skipped: "missing" | "notExecutable" | null;
}

export interface PipelineRun {
	mode: PipelineMode;
	/** Steps in the order they were attempted. */
	steps: StepRun[];
	/** The first failing step, or null when every step succeeded. */
	failed: StepRun | null;
	ok: boolean;
	/** True when there is no pipeline directory at all. */
	empty: boolean;
}

/** What the pipeline believes is currently applied to the host. */
interface PipelineState {
	/** Commit the applied steps were taken from. */
	sha: string;
	/** Step filenames, in apply order. */
	steps: string[];
	at: number;
}

export function pipelineDir(): string {
	return resolve(
		process.cwd(),
		process.env.LAUNCHER_PIPELINE_DIR || DEFAULT_DIR,
	);
}

/**
 * Step files in apply order: ascending filename, compared numerically so `2-`
 * sorts before `10-`. Documentation (`*.md`) and dotfiles are not steps.
 */
export async function listSteps(): Promise<string[]> {
	const entries = await readdir(pipelineDir(), { withFileTypes: true }).catch(
		() => [],
	);
	return entries
		.filter((e) => !e.isDirectory())
		.map((e) => e.name)
		.filter((n) => !n.startsWith(".") && !n.endsWith(".md"))
		.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

/**
 * How to execute a step. TypeScript and JavaScript run under the same bun that
 * runs the bot; shell scripts under bash; anything else must carry its own
 * executable bit (and shebang).
 */
async function runnerFor(path: string): Promise<string[] | null> {
	if (/\.(ts|tsx|js|mjs|cjs)$/.test(path)) return [process.execPath, path];
	if (/\.(sh|bash)$/.test(path)) return ["/bin/bash", path];
	const mode = await stat(path).then(
		(s) => s.mode,
		() => 0,
	);
	return mode & 0o111 ? [path] : null;
}

function truncate(text: string): string {
	return text.length > MAX_STEP_OUTPUT
		? `${text.slice(0, MAX_STEP_OUTPUT)}\n… (truncated)`
		: text;
}

async function runStep(
	name: string,
	mode: PipelineMode,
	ctx: PipelineContext,
): Promise<StepRun> {
	const path = join(pipelineDir(), name);
	const base: Omit<StepRun, "ok" | "code" | "output" | "skipped"> = {
		step: name,
		durationMs: 0,
		timedOut: false,
	};

	const exists = await stat(path).then(
		() => true,
		() => false,
	);
	if (!exists) {
		// Unapply works from the recorded step list, so a step that the version
		// being left behind had but this checkout no longer carries is normal.
		return {
			...base,
			ok: true,
			code: 0,
			output: "",
			skipped: "missing",
		};
	}

	const cmd = await runnerFor(path);
	if (!cmd) {
		return {
			...base,
			ok: false,
			code: -1,
			output: `${name} is neither .ts/.js nor .sh and is not executable — chmod +x it or give it a known extension.`,
			skipped: "notExecutable",
		};
	}

	const startedAt = Date.now();
	let child: Bun.Subprocess<"ignore", "pipe", "pipe">;
	try {
		child = Bun.spawn([...cmd, mode], {
			cwd: process.cwd(),
			env: {
				...process.env,
				LAUNCHER_PIPELINE_MODE: mode,
				LAUNCHER_PIPELINE_STEP: name,
				LAUNCHER_REASON: ctx.reason,
				LAUNCHER_FROM_SHA: ctx.fromSha,
				LAUNCHER_TO_SHA: ctx.toSha,
				LAUNCHER_FROM_REF: ctx.fromRef,
				LAUNCHER_TO_REF: ctx.toRef,
			},
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (err) {
		return {
			...base,
			ok: false,
			code: -1,
			output: `failed to spawn ${name}: ${err}`,
			durationMs: Date.now() - startedAt,
			skipped: null,
		};
	}

	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		child.kill();
	}, STEP_TIMEOUT_MS);

	const [code, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]).finally(() => clearTimeout(timer));

	const output = truncate(`${stdout}${stderr}`.trim());
	const ok = code === 0 && !timedOut;
	if (!ok) {
		console.error(
			`${TAG} ${mode} ${name} ${timedOut ? "timed out" : `exited ${code}`}` +
				(output ? `:\n${output}` : ""),
		);
	} else {
		console.log(`${TAG} ${mode} ${name} ok (${Date.now() - startedAt}ms)`);
	}
	return {
		...base,
		ok,
		code,
		output: timedOut
			? `${output}\n${name} exceeded ${STEP_TIMEOUT_MS / 1000}s and was killed.`.trim()
			: output,
		durationMs: Date.now() - startedAt,
		timedOut,
		skipped: null,
	};
}

export function getPipelineState(): Promise<PipelineState | null> {
	return store.get<PipelineState>("pipeline");
}

/**
 * Run the pipeline in one direction, stopping at the first failing step.
 *
 * `apply` walks the current checkout's steps in order and records what ran;
 * `unapply` walks the *recorded* steps in reverse, so a version is torn down
 * by the step list it was applied with even if the working tree has since
 * moved on. With nothing recorded, unapply falls back to what is on disk.
 *
 * Nothing is rolled back automatically: a failed run stops where it is and
 * reports, leaving the host in a state an operator can inspect and re-run
 * with `/launcher pipeline`. Write steps to be idempotent.
 */
export async function runPipeline(
	mode: PipelineMode,
	ctx: PipelineContext,
): Promise<PipelineRun> {
	const onDisk = await listSteps();
	const recorded = mode === "unapply" ? (await getPipelineState())?.steps : null;
	const order = mode === "unapply" ? [...(recorded ?? onDisk)].reverse() : onDisk;

	if (order.length === 0) {
		return { mode, steps: [], failed: null, ok: true, empty: true };
	}

	console.log(`${TAG} ${mode}ing ${order.length} step(s) for ${ctx.reason}`);
	const steps: StepRun[] = [];
	let failed: StepRun | null = null;
	for (const name of order) {
		const run = await runStep(name, mode, ctx);
		steps.push(run);
		if (!run.ok) {
			failed = run;
			break;
		}
	}

	// Record what is applied now: everything that ran on apply, and whatever
	// was left untouched by a half-finished unapply.
	if (mode === "apply") {
		const applied = steps.filter((s) => s.ok).map((s) => s.step);
		await store.set("pipeline", {
			sha: ctx.toSha,
			steps: applied,
			at: Date.now(),
		} satisfies PipelineState);
	} else {
		const undone = new Set(steps.filter((s) => s.ok).map((s) => s.step));
		const remaining = (recorded ?? onDisk).filter((s) => !undone.has(s));
		if (remaining.length === 0) {
			await store.delete("pipeline");
		} else {
			await store.set("pipeline", {
				sha: ctx.fromSha,
				steps: remaining,
				at: Date.now(),
			} satisfies PipelineState);
		}
	}

	return { mode, steps, failed, ok: failed === null, empty: false };
}
