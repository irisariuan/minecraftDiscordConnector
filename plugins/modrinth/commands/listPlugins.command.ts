import { existsSync } from "node:fs";
import { SlashCommandBuilder, time } from "discord.js";
import type { CommandFile } from "../../../lib/commandFile";
import { deletePluginRecord, getPluginsByServerId } from "../../../lib/db";
import { sendPaginationMessage } from "../../../lib/pagination";
import { getActivePlugins } from "../../../lib/serverInstance/plugin";
import { trimTextWithSuffix } from "../../../lib/utils";
import { sendSelectableActionMessage } from "../selectable";
import { downloadPluginFile, getProjects, getVersionsBulk } from "../lib";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnrichedPlugin {
	projectId: string;
	versionId: string;
	filePath: string;
	createdAt: Date;
	updatedAt: Date;
	projectName: string;
	versionNumber: string;
	filename: string;
	onDisk: boolean;
}

type MissingAction = "redownload" | "delete" | "skip";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRedownloadable(p: EnrichedPlugin): boolean {
	return (
		!p.versionId.startsWith("sha1:") && !p.versionId.startsWith("mrpack:")
	);
}

// ─── Command ──────────────────────────────────────────────────────────────────

export default {
	command: new SlashCommandBuilder()
		.setName("listplugins")
		.setDescription(
			"Show all Modrinth-tracked plugins with version info and disk status",
		),

	requireServer: true,
	ephemeral: true,

	async execute({ interaction, server }) {
		// ── Phase 1: build enriched list ──────────────────────────────────
		const [dbPlugins, diskPlugins] = await Promise.all([
			getPluginsByServerId(server.id),
			getActivePlugins(server.config.pluginDir).catch(() => null),
		]);

		const uniqueProjectIds = [
			...new Set(dbPlugins.map((p) => p.projectId)),
		];
		const uniqueVersionIds = [
			...new Set(dbPlugins.map((p) => p.versionId)),
		];
		const [projectMap, versionMap] = await Promise.all([
			getProjects(uniqueProjectIds),
			getVersionsBulk(uniqueVersionIds),
		]);

		const enriched: EnrichedPlugin[] = dbPlugins.map((p) => {
			const project = projectMap.get(p.projectId);
			const version = versionMap.get(p.versionId);
			const filename = p.filePath.split("/").pop() ?? p.filePath;
			const onDisk =
				diskPlugins !== null ? existsSync(p.filePath) : false;
			return {
				projectId: p.projectId,
				versionId: p.versionId,
				filePath: p.filePath,
				createdAt: p.createdAt,
				updatedAt: p.updatedAt,
				projectName: project?.title ?? p.projectId,
				versionNumber: version?.version_number ?? p.versionId,
				filename,
				onDisk,
			};
		});

		// ── Phase 2: paginated embed ──────────────────────────────────────
		await sendPaginationMessage<EnrichedPlugin>({
			interaction,
			getResult: () => enriched,

			formatter: (plugin) => ({
				name: `${plugin.onDisk ? "✅" : "❌"} ${plugin.projectName}`,
				value: [
					`Version: \`${plugin.versionNumber}\`${plugin.versionNumber !== plugin.versionId ? ` (ID: \`${plugin.versionId}\`)` : ""}`,
					`File: \`${plugin.filename}\``,
					`Project ID: \`${plugin.projectId}\``,
					plugin.onDisk ? "💾 On disk" : "‼️ **Missing from disk**",
					`Added: ${time(plugin.createdAt, "R")}`,
					`Updated: ${time(plugin.updatedAt, "R")}`,
				].join("\n"),
			}),

			filterFunc: (filter) => (plugin) => {
				if (!filter) return true;
				const f = filter.toLowerCase();
				return (
					plugin.projectName.toLowerCase().includes(f) ||
					plugin.versionNumber.toLowerCase().includes(f) ||
					plugin.filename.toLowerCase().includes(f) ||
					plugin.projectId.toLowerCase().includes(f) ||
					plugin.versionId.toLowerCase().includes(f)
				);
			},

			options: {
				title: () =>
					`Installed Plugins (${enriched.length} total, ${enriched.filter((p) => !p.onDisk).length} missing)`,
				notFoundMessage: "No plugins are registered for this server.",
			},
		});

		// ── Phase 3: missing-plugin recovery ─────────────────────────────
		const missing = enriched.filter((p) => !p.onDisk);
		if (missing.length === 0) return;

		await sendSelectableActionMessage<EnrichedPlugin, MissingAction>({
			interaction,
			items: missing,
			getItemId: (p) => p.versionId,

			actions: {
				redownload: {
					icon: "🔄",
					label: "Re-download",
					isActive: true,
				},
				delete: { icon: "🗑️", label: "Delete from DB", isActive: true },
				skip: { icon: "⏭️", label: "Skip", isActive: false },
			},

			initialAction: (p) =>
				isRedownloadable(p) ? "redownload" : "delete",

			cycleAction: (p, current) => {
				if (isRedownloadable(p)) {
					const cycle: Record<MissingAction, MissingAction> = {
						redownload: "skip",
						skip: "delete",
						delete: "redownload",
					};
					return cycle[current];
				}
				// Non-re-downloadable items only toggle delete ↔ skip
				return current === "delete" ? "skip" : "delete";
			},

			selectionTitle: `⚠️ ${missing.length} Plugin(s) Missing from Disk`,

			selectionDescription: (counts) =>
				[
					"Use the select menu to cycle each plugin's action, then click **Apply**.",
					"",
					`🔄 Re-download: **${counts.redownload}** · 🗑️ Delete from DB: **${counts.delete}** · ⏭️ Skip: **${counts.skip}**`,
				].join("\n"),

			formatField: (p, action) => {
				const icons: Record<MissingAction, string> = {
					redownload: "🔄",
					delete: "🗑️",
					skip: "⏭️",
				};
				const labels: Record<MissingAction, string> = {
					redownload: "Re-download",
					delete: "Delete from DB",
					skip: "Skip",
				};
				return {
					name: `${icons[action]} ${p.projectName}`,
					value: [
						`Version: \`${p.versionNumber}\``,
						`File: \`${p.filename}\``,
						`Action: **${labels[action]}**`,
					].join("\n"),
				};
			},

			formatOption: (p, action) => {
				const icons: Record<MissingAction, string> = {
					redownload: "🔄",
					delete: "🗑️",
					skip: "⏭️",
				};
				const labels: Record<MissingAction, string> = {
					redownload: "Re-download",
					delete: "Delete from DB",
					skip: "Skip",
				};
				return {
					label: `${icons[action]} ${labels[action]}: ${trimTextWithSuffix(p.projectName, 75)}`,
					description: trimTextWithSuffix(
						`${p.versionNumber} · ${p.filename}`,
						100,
					),
				};
			},

			applyLabel: (counts) => {
				const parts: string[] = [];
				if (counts.redownload > 0)
					parts.push(`${counts.redownload} 🔄`);
				if (counts.delete > 0) parts.push(`${counts.delete} 🗑️`);
				return parts.length > 0
					? `Apply (${parts.join(", ")})`
					: "Nothing to Apply";
			},

			process: async (p, action) => {
				if (action === "redownload") {
					const { newDownload } = await downloadPluginFile(
						server,
						p.versionId,
						true, // force-overwrite zero-byte remnants
					);
					return newDownload;
				}
				// action === "delete"
				return deletePluginRecord(p.projectId, p.versionId, server.id)
					.then(() => true)
					.catch(() => false);
			},

			formatProgressValue: (p, action) =>
				action === "redownload"
					? `🔄 Re-downloading \`${p.versionNumber}\``
					: `🗑️ Deleting \`${p.versionNumber}\``,

			formatResultEntry: (p) =>
				`**${p.projectName}** \`${p.versionNumber}\``,

			// Only mention a restart if at least one file was actually re-downloaded
			resultFooter: (succeeded) =>
				(succeeded.get("redownload")?.length ?? 0) > 0
					? "🔄 Restart the server for changes to take effect."
					: null,
		});
	},

	features: {
		supportedPlatforms: ["minecraft"],
	},
} satisfies CommandFile<true>;
