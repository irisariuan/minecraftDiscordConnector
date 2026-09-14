import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { PermissionFlags, type CommandFile } from "../api";
import {
	getLastRemoteCheck,
	isGitRepo,
	isUnderLauncher,
	launcherPid,
	listBranches,
	listRecentCommits,
	listTags,
	pullFastForward,
	readGitStatus,
	requestRestart,
	runPipelineManually,
	switchVersion,
} from "./lib";
import {
	getPipelineState,
	listSteps,
	pipelineDir,
	type PipelineRun,
} from "./pipeline";

const MAX_AUTOCOMPLETE = 25;
/** Discord rejects an autocomplete choice name longer than this. */
const MAX_CHOICE_NAME = 100;

function relative(ms: number) {
	return `<t:${Math.floor(ms / 1000)}:R>`;
}

function describeDeps(deps: "unchanged" | "installed" | "failed"): string {
	switch (deps) {
		case "installed":
			return "Dependencies changed and `bun install` ran.";
		case "failed":
			return "⚠️ Dependencies changed but `bun install` failed — check the console.";
		default:
			return "";
	}
}

function clip(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** One line summarising a pipeline run, or "" when there was nothing to run. */
function describePipeline(run: PipelineRun | null): string {
	if (!run || run.empty) return "";
	const verb = run.mode === "apply" ? "Applied" : "Unapplied";
	const ran = run.steps.filter((s) => s.ok && !s.skipped).length;
	if (run.ok) {
		return ran === 0 ? "" : `⚙️ ${verb} ${ran} pipeline step(s).`;
	}
	const failed = run.failed;
	return [
		`❌ Pipeline ${run.mode} failed at \`${failed?.step}\`` +
			(failed?.timedOut ? " (timed out)" : ` (exit ${failed?.code})`) +
			(ran > 0 ? ` — ${ran} earlier step(s) had already run.` : "."),
		failed?.output
			? `\`\`\`\n${clip(failed.output, 1200)}\n\`\`\``
			: "",
	]
		.filter(Boolean)
		.join("\n");
}

export default {
	command: new SlashCommandBuilder()
		.setName("launcher")
		.setDescription("Manage the bot's own checkout: git status, branches, restart")
		.addSubcommand((s) =>
			s
				.setName("status")
				.setDescription("Show the bot's branch, commit and remote status")
				.addBooleanOption((o) =>
					o
						.setName("fetch")
						.setDescription("Contact the remote first (default: use last check)"),
				),
		)
		.addSubcommand((s) =>
			s.setName("branches").setDescription("List local and remote branches"),
		)
		.addSubcommand((s) =>
			s
				.setName("switch")
				.setDescription(
					"Check out another branch, tag or commit (restart afterwards to apply)",
				)
				.addStringOption((o) =>
					o
						.setName("target")
						.setDescription("Branch, tag or commit to check out")
						.setRequired(true)
						.setAutocomplete(true),
				)
				.addBooleanOption((o) =>
					o
						.setName("pipeline")
						.setDescription("Run the version pipeline (default: yes)"),
				),
		)
		.addSubcommand((s) =>
			s
				.setName("pull")
				.setDescription("Fast-forward the current branch to its remote")
				.addBooleanOption((o) =>
					o
						.setName("pipeline")
						.setDescription("Run the version pipeline (default: yes)"),
				),
		)
		.addSubcommand((s) =>
			s
				.setName("pipeline")
				.setDescription("Inspect or re-run the version pipeline by hand")
				.addStringOption((o) =>
					o
						.setName("action")
						.setDescription("What to do with the pipeline (default: list)")
						.addChoices(
							{ name: "list — show the steps and what is applied", value: "list" },
							{ name: "apply — run every step for this checkout", value: "apply" },
							{ name: "unapply — undo the applied steps in reverse", value: "unapply" },
						),
				),
		)
		.addSubcommand((s) =>
			s
				.setName("restart")
				.setDescription("Stop all game servers and restart the bot in place")
				.addBooleanOption((o) =>
					o
						.setName("force")
						.setDescription("Restart even if game servers are online"),
				),
		),
	requireServer: false,
	permissions: PermissionFlags.editSetting,

	async autoComplete({ interaction }) {
		const focused = interaction.options.getFocused().toLowerCase();
		const [branches, tags, commits] = await Promise.all([
			listBranches().catch(() => ({
				current: "",
				local: [] as string[],
				remote: new Map<string, string>(),
			})),
			listTags().catch(() => [] as string[]),
			listRecentCommits().catch(() => []),
		]);
		const { current, local, remote } = branches;

		// Branches first (the common case), then tags, then recent commits — a
		// commit is matched on both its sha and its subject so it can be found
		// by what it did as well as by its hash.
		const choices: { name: string; value: string }[] = [];
		for (const n of [...new Set([...local, ...remote.keys()])]
			.filter((n) => n !== current && n.toLowerCase().includes(focused))
			.sort((a, b) => {
				const la = local.includes(a) ? 0 : 1;
				const lb = local.includes(b) ? 0 : 1;
				return la - lb || a.localeCompare(b);
			})) {
			choices.push({
				name: local.includes(n) ? n : `${n} (remote only)`,
				value: n,
			});
		}
		for (const t of tags.filter((t) => t.toLowerCase().includes(focused))) {
			choices.push({ name: `${t} (tag)`, value: t });
		}
		for (const c of commits) {
			if (
				focused &&
				!c.sha.startsWith(focused) &&
				!c.subject.toLowerCase().includes(focused)
			) {
				continue;
			}
			choices.push({
				name: clip(`${c.shortSha} — ${c.subject}`, MAX_CHOICE_NAME),
				value: c.shortSha,
			});
		}

		await interaction.respond(choices.slice(0, MAX_AUTOCOMPLETE));
	},

	async execute({ interaction, client, serverManager }) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (!(await isGitRepo())) {
			return interaction.editReply(
				"The bot's working directory is not a git repository, so the launcher cannot manage it.",
			);
		}
		const sub = interaction.options.getSubcommand(true);

		if (sub === "status") {
			const fetch = interaction.options.getBoolean("fetch") ?? false;
			const status = await readGitStatus({ fetch });
			const lastCheck = await getLastRemoteCheck();

			let sync: string;
			if (!status.upstream) sync = "no upstream configured";
			else if (status.ahead === 0 && status.behind === 0) sync = "✅ in sync";
			else {
				const parts: string[] = [];
				if (status.behind > 0) parts.push(`⬇️ ${status.behind} behind`);
				if (status.ahead > 0) parts.push(`⬆️ ${status.ahead} ahead`);
				sync = parts.join(", ");
			}
			const embed = new EmbedBuilder()
				.setTitle("🚀 Launcher Status")
				.setColor(
					status.fetchError ? 0xe74c3c : status.behind > 0 ? 0xf1c40f : 0x2ecc71,
				)
				.addFields(
					{
						name: "Branch",
						value: status.detached ? "*detached HEAD*" : `\`${status.branch}\``,
						inline: true,
					},
					{
						name: "Upstream",
						value: status.upstream ? `\`${status.upstream}\` — ${sync}` : sync,
						inline: true,
					},
					{
						name: "Local commit",
						value: status.head
							? `\`${status.head.shortSha}\` ${status.head.subject}`
							: "—",
					},
				);
			if (status.remoteHead && status.behind > 0) {
				embed.addFields({
					name: "Remote commit",
					value: `\`${status.remoteHead.shortSha}\` ${status.remoteHead.subject}`,
				});
			}
			embed.addFields(
				{
					name: "Working tree",
					value:
						status.dirtyFiles === 0
							? "clean"
							: `⚠️ ${status.dirtyFiles} modified/untracked path(s)`,
					inline: true,
				},
				{
					name: "Remote checked",
					value: fetch
						? status.fetchError
							? `❌ fetch failed: ${status.fetchError.slice(0, 200)}`
							: "just now"
						: lastCheck
							? `${relative(lastCheck.at)}${lastCheck.error ? " (failed)" : ""}`
							: "never",
					inline: true,
				},
				{
					name: "Launcher",
					value: isUnderLauncher()
						? `✅ attached (pid ${launcherPid() ?? "?"}), restart available`
						: "❌ not running under the launcher — `/launcher restart` unavailable",
				},
			);
			if (status.remoteUrl) embed.setFooter({ text: status.remoteUrl });
			return interaction.editReply({ embeds: [embed] });
		}

		if (sub === "branches") {
			const { current, local, remote } = await listBranches();
			const remoteOnly = [...remote.keys()].filter((n) => !local.includes(n));
			const localLines = local.map((n) =>
				n === current ? `• **${n}** (current)` : `• ${n}`,
			);
			const embed = new EmbedBuilder()
				.setTitle("🌿 Branches")
				.setColor(0x3498db)
				.addFields(
					{ name: "Local", value: localLines.join("\n") || "—" },
					{
						name: "Remote only",
						value:
							remoteOnly.map((n) => `• ${n} (\`${remote.get(n)}\`)`).join("\n") ||
							"—",
					},
				);
			return interaction.editReply({ embeds: [embed] });
		}

		if (sub === "switch") {
			const name = interaction.options.getString("target", true).trim();
			const pipeline = interaction.options.getBoolean("pipeline") ?? true;
			const result = await switchVersion(name, { pipeline });
			switch (result.status) {
				case "switched": {
					const detached = result.target.branch === null;
					return interaction.editReply(
						[
							`✅ Switched \`${result.from}\` → \`${result.to}\`` +
								(detached
									? ` (detached at \`${result.target.shortSha}\` ${result.target.subject}).`
									: "."),
							describePipeline(result.unapply),
							describeDeps(result.deps),
							describePipeline(result.apply),
							result.apply && !result.apply.ok
								? "The checkout moved but the pipeline did not finish — fix the step and re-run `/launcher pipeline action:apply`."
								: "Run `/launcher restart` to start the bot from this version.",
						]
							.filter(Boolean)
							.join("\n"),
					);
				}
				case "alreadyOn":
					return interaction.editReply(`Already on \`${result.target}\`.`);
				case "dirty":
					return interaction.editReply(
						`❌ Working tree has ${result.files} modified/untracked path(s). Commit or stash them on the host before switching.`,
					);
				case "invalidName":
					return interaction.editReply(
						`❌ \`${clip(name, 80)}\` is not a usable branch, tag or commit.`,
					);
				case "notFound":
					return interaction.editReply(
						`❌ Nothing named \`${clip(result.target, 80)}\` — no such branch, tag or commit. Try \`/launcher status fetch:true\` to refresh from the remote.`,
					);
				case "unapplyFailed":
					return interaction.editReply(
						[
							"❌ Nothing was checked out: the current version's pipeline could not be unapplied.",
							describePipeline(result.run),
						].join("\n"),
					);
				default:
					return interaction.editReply(
						`❌ git switch failed:\n\`\`\`\n${result.message.slice(0, 1500)}\n\`\`\``,
					);
			}
		}

		if (sub === "pull") {
			const pipeline = interaction.options.getBoolean("pipeline") ?? true;
			const result = await pullFastForward({ pipeline });
			switch (result.status) {
				case "updated":
					return interaction.editReply(
						[
							`✅ Fast-forwarded \`${result.branch}\` by ${result.commits} commit(s): \`${result.from?.shortSha ?? "?"}\` → \`${result.to?.shortSha ?? "?"}\` ${result.to?.subject ?? ""}`,
							describePipeline(result.unapply),
							describeDeps(result.deps),
							describePipeline(result.apply),
							result.apply && !result.apply.ok
								? "The branch moved but the pipeline did not finish — fix the step and re-run `/launcher pipeline action:apply`."
								: "Run `/launcher restart` to apply.",
						]
							.filter(Boolean)
							.join("\n"),
					);
				case "upToDate":
					return interaction.editReply(
						`✅ \`${result.branch}\` is already up to date with its upstream.`,
					);
				case "noUpstream":
					return interaction.editReply(
						`❌ \`${result.branch}\` has no upstream branch to pull from.`,
					);
				case "dirty":
					return interaction.editReply(
						`❌ Working tree has ${result.files} modified/untracked path(s). Commit or stash them on the host before pulling.`,
					);
				case "unapplyFailed":
					return interaction.editReply(
						[
							"❌ Nothing was pulled: the current version's pipeline could not be unapplied.",
							describePipeline(result.run),
						].join("\n"),
					);
				default:
					return interaction.editReply(
						`❌ Pull failed:\n\`\`\`\n${result.message.slice(0, 1500)}\n\`\`\``,
					);
			}
		}

		if (sub === "pipeline") {
			const action = interaction.options.getString("action") ?? "list";

			if (action === "list") {
				const [steps, state] = await Promise.all([
					listSteps(),
					getPipelineState(),
				]);
				const embed = new EmbedBuilder()
					.setTitle("⚙️ Version Pipeline")
					.setColor(steps.length === 0 ? 0x95a5a6 : 0x3498db)
					.setFooter({ text: pipelineDir() });
				if (steps.length === 0) {
					embed.setDescription(
						"No pipeline steps. Add executable files to the directory below to run work around every `/launcher switch` and `/launcher pull`; each one is called with `apply` or `unapply`.",
					);
				} else {
					const applied = new Set(state?.steps ?? []);
					embed.addFields(
							{
							name: "Steps (apply order)",
							// An embed field caps at 1024 characters.
							value: clip(
								steps
									.map((n, i) => `${i + 1}. ${applied.has(n) ? "✅" : "▫️"} \`${n}\``)
									.join("\n"),
								1024,
							),
						},
						{
							name: "Applied",
							value: state
								? `${state.steps.length} step(s) from \`${state.sha.slice(0, 7)}\`, ${relative(state.at)}`
								: "nothing recorded — the pipeline has not run yet",
						},
					);
				}
				return interaction.editReply({ embeds: [embed] });
			}

			const mode = action === "unapply" ? "unapply" : "apply";
			const run = await runPipelineManually(mode);
			if (run.empty) {
				return interaction.editReply(
					`No pipeline steps to ${mode} — \`${pipelineDir()}\` is empty or absent.`,
				);
			}
			const summary = describePipeline(run);
			return interaction.editReply(
				run.ok
					? summary || `✅ Pipeline ${mode} finished with nothing to do.`
					: summary,
			);
		}

		// restart
		if (!isUnderLauncher()) {
			return interaction.editReply(
				"❌ The bot is not running under the launcher, so it cannot restart itself in place. Start it with `bun run start` (which runs `plugins/launcher/launcher.ts`).",
			);
		}
		const force = interaction.options.getBoolean("force") ?? false;
		let online = 0;
		for (const [, server] of serverManager.getAllServerEntries()) {
			if (await server.isOnline.getData(true)) online++;
		}
		if (online > 0 && !force) {
			return interaction.editReply(
				`❌ ${online} game server(s) are online and would be stopped. Re-run with \`force:true\` to restart anyway.`,
			);
		}
		await interaction.editReply(
			online > 0
				? `🔄 Stopping ${online} game server(s) and restarting the bot… you'll get a follow-up when it's back.`
				: "🔄 Restarting the bot… you'll get a follow-up when it's back.",
		);
		await requestRestart({ interaction, client, serverManager });
	},
} satisfies CommandFile<false>;
