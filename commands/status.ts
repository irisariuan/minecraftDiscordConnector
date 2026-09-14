import { bold, EmbedBuilder, italic, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import type { Server } from "../lib/server";

/** How long the embed waits between intermediate edits while probes land. */
const RENDER_INTERVAL = 1500;

/** Grace period before an unfinished probe list is shown as "checking…". */
const FIRST_PAINT_GRACE = 400;

/** Embed descriptions are capped at 4096 characters; leave room for the tail. */
const DESCRIPTION_BUDGET = 3800;

type RowState = "pending" | "online" | "offline" | "error";

interface StatusRow {
	id: number;
	/** Pre-rendered name; the id is only appended when a tag hides it. */
	label: string;
	state: RowState;
	suspending: boolean;
}

const STATE_ICON: Record<RowState, string> = {
	pending: "⏳",
	online: "🟢",
	offline: "🔴",
	error: "⚠️",
};

const STATE_LABEL: Record<RowState, string> = {
	pending: "checking…",
	online: "online",
	offline: "offline",
	error: "unknown",
};

function serverName(id: number, server: Server): string {
	return server.config.tag ?? `Server #${id}`;
}

function serverLabel(id: number, server: Server): string {
	return server.config.tag
		? `${bold(server.config.tag)} ${italic(`#${id}`)}`
		: bold(`Server #${id}`);
}

function buildEmbed(rows: StatusRow[]): EmbedBuilder {
	const lines: string[] = [];
	let truncated = 0;
	let used = 0;

	for (const row of rows) {
		const line = `${STATE_ICON[row.state]} ${row.label} · ${
			STATE_LABEL[row.state]
		}${row.suspending ? " · suspending" : ""}`;
		if (used + line.length + 1 > DESCRIPTION_BUDGET) {
			truncated++;
			continue;
		}
		used += line.length + 1;
		lines.push(line);
	}
	if (truncated > 0) lines.push(italic(`…and ${truncated} more`));

	const online = rows.filter((r) => r.state === "online").length;
	const offline = rows.filter((r) => r.state === "offline").length;
	const pending = rows.filter((r) => r.state === "pending").length;
	const unknown = rows.filter((r) => r.state === "error").length;

	const summary = [
		`🟢 ${online} online`,
		`🔴 ${offline} offline`,
		unknown > 0 ? `⚠️ ${unknown} unknown` : null,
		pending > 0 ? `⏳ ${pending} checking` : null,
	]
		.filter((part) => part !== null)
		.join(" · ");

	return new EmbedBuilder()
		.setTitle("Server Status")
		.setDescription(lines.join("\n") || italic("No servers available"))
		.setColor(pending > 0 ? 0x5865f2 : online > 0 ? 0x2ecc71 : 0x95a5a6)
		.setFooter({ text: summary })
		.setTimestamp();
}

/**
 * Resolve the `server` option against the servers this user may see.
 *
 * The autocomplete hands back a server id, but the option accepts free text
 * too, so fall back to matching the tag.
 */
function resolveServer(
	raw: string,
	entries: [number, Server][],
): [number, Server] | null {
	const id = parseInt(raw.trim(), 10);
	if (!isNaN(id)) {
		const byId = entries.find(([entryId]) => entryId === id);
		if (byId) return byId;
	}

	const needle = raw.trim().toLowerCase();
	if (needle.length === 0) return null;
	return (
		entries.find(
			([entryId, server]) =>
				serverName(entryId, server).toLowerCase() === needle,
		) ??
		entries.find(([entryId, server]) =>
			serverName(entryId, server).toLowerCase().includes(needle),
		) ??
		null
	);
}

export default {
	command: new SlashCommandBuilder()
		.setName("status")
		.setDescription("Show the status of every server")
		.addStringOption((option) =>
			option
				.setName("server")
				.setDescription(
					"Only show this server (defaults to every server you can see)",
				)
				.setAutocomplete(true)
				.setRequired(false),
		),
	requireServer: false,
	async execute({ interaction, serverManager }) {
		await interaction.deferReply();

		const accessible = await serverManager.getAccessibleServerEntries(
			interaction.user.id,
		);
		if (accessible.length === 0) {
			return await interaction.editReply({
				content: "No servers available",
			});
		}

		// ── Narrow to one server when the option is given ───────────────────
		const requested = interaction.options.getString("server");
		let entries = accessible;
		if (requested) {
			const match = resolveServer(requested, accessible);
			if (!match) {
				return await interaction.editReply({
					content: `❌ No server you can see matches \`${requested}\`.`,
				});
			}
			entries = [match];
		}

		const rows: StatusRow[] = entries.map(([id, server]) => ({
			id,
			label: serverLabel(id, server),
			state: "pending",
			suspending: server.suspendingEvent.isSuspending(),
		}));

		let throttle: NodeJS.Timeout | null = null;
		let queued = false;
		/** Progressive painting starts once the probes prove to be slow. */
		let progressive = false;
		/**
		 * Edits are chained rather than fired in parallel so a slow
		 * intermediate edit can never land after the final one and leave a
		 * stale embed behind.
		 */
		let editChain: Promise<unknown> = Promise.resolve();

		const flush = () => {
			editChain = editChain
				.then(() =>
					interaction.editReply({ embeds: [buildEmbed(rows)] }),
				)
				.catch(() => {});
		};

		/** Edit at most once per {@link RENDER_INTERVAL} while probes resolve. */
		const scheduleRender = () => {
			if (throttle) {
				queued = true;
				return;
			}
			flush();
			throttle = setTimeout(() => {
				throttle = null;
				if (queued) {
					queued = false;
					scheduleRender();
				}
			}, RENDER_INTERVAL);
		};

		// ── Probe every server at once ──────────────────────────────────────
		const probes = Promise.all(
			entries.map(async ([, server], index) => {
				const row = rows[index]!;
				const online = await server.isOnline
					.getData(true)
					.catch(() => null);
				row.state =
					online === null ? "error" : online ? "online" : "offline";
				row.suspending = server.suspendingEvent.isSuspending();
				if (progressive) scheduleRender();
			}),
		);

		// Probes are usually instant, so hold the first paint briefly rather
		// than flashing a list of "checking…" rows. Once the grace period is
		// up, show what has resolved and keep the embed updating.
		const grace = new Promise<void>((resolve) =>
			setTimeout(resolve, FIRST_PAINT_GRACE),
		);
		const finishedFirst = await Promise.race([
			probes.then(() => true),
			grace.then(() => false),
		]);
		if (!finishedFirst) {
			progressive = true;
			scheduleRender();
		}

		await probes;

		if (throttle) clearTimeout(throttle);
		flush();
		return await editChain;
	},
	async autoComplete({ interaction, serverManager }) {
		const focused = interaction.options.getFocused().toLowerCase();
		const pairs = await serverManager.getAccessibleTagPairs(
			interaction.user.id,
		);

		const choices = pairs
			.map((pair) => ({
				name: `${pair.tag ?? `Server #${pair.id}`} (#${pair.id})`,
				value: String(pair.id),
			}))
			.filter((choice) => choice.name.toLowerCase().includes(focused))
			.slice(0, 25);

		return await interaction.respond(choices);
	},
} satisfies CommandFile<false>;
