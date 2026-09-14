import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { PermissionFlags, type CommandFile } from "../api";
import {
	getLastRemoteCheck,
	isGitRepo,
	isUnderLauncher,
	launcherPid,
	listBranches,
	pullFastForward,
	readGitStatus,
	requestRestart,
	switchBranch,
} from "./lib";

const MAX_AUTOCOMPLETE = 25;

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
				.setDescription("Check out another branch (restart afterwards to apply)")
				.addStringOption((o) =>
					o
						.setName("branch")
						.setDescription("Branch to switch to")
						.setRequired(true)
						.setAutocomplete(true),
				),
		)
		.addSubcommand((s) =>
			s
				.setName("pull")
				.setDescription("Fast-forward the current branch to its remote"),
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
		const { current, local, remote } = await listBranches().catch(() => ({
			current: "",
			local: [] as string[],
			remote: new Map<string, string>(),
		}));
		const names = [...new Set([...local, ...remote.keys()])]
			.filter((n) => n !== current && n.toLowerCase().includes(focused))
			.sort((a, b) => {
				const la = local.includes(a) ? 0 : 1;
				const lb = local.includes(b) ? 0 : 1;
				return la - lb || a.localeCompare(b);
			})
			.slice(0, MAX_AUTOCOMPLETE);
		await interaction.respond(
			names.map((n) => ({
				name: local.includes(n) ? n : `${n} (remote only)`,
				value: n,
			})),
		);
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
			const name = interaction.options.getString("branch", true).trim();
			const result = await switchBranch(name);
			switch (result.status) {
				case "switched":
					return interaction.editReply(
						[
							`✅ Switched \`${result.from}\` → \`${result.to}\`.`,
							describeDeps(result.deps),
							"Run `/launcher restart` to start the bot from this branch.",
						]
							.filter(Boolean)
							.join("\n"),
					);
				case "alreadyOn":
					return interaction.editReply(`Already on \`${result.branch}\`.`);
				case "dirty":
					return interaction.editReply(
						`❌ Working tree has ${result.files} modified/untracked path(s). Commit or stash them on the host before switching.`,
					);
				case "invalidName":
					return interaction.editReply(`❌ \`${name}\` is not a valid branch name.`);
				case "notFound":
					return interaction.editReply(
						`❌ No local or remote branch named \`${result.branch}\`. Try \`/launcher status fetch:true\` to refresh remote branches.`,
					);
				default:
					return interaction.editReply(
						`❌ git switch failed:\n\`\`\`\n${result.message.slice(0, 1500)}\n\`\`\``,
					);
			}
		}

		if (sub === "pull") {
			const result = await pullFastForward();
			switch (result.status) {
				case "updated":
					return interaction.editReply(
						[
							`✅ Fast-forwarded \`${result.branch}\` by ${result.commits} commit(s): \`${result.from?.shortSha ?? "?"}\` → \`${result.to?.shortSha ?? "?"}\` ${result.to?.subject ?? ""}`,
							describeDeps(result.deps),
							"Run `/launcher restart` to apply.",
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
				default:
					return interaction.editReply(
						`❌ Pull failed:\n\`\`\`\n${result.message.slice(0, 1500)}\n\`\`\``,
					);
			}
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
