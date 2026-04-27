import { existsSync } from "node:fs";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	MessageFlags,
	SlashCommandBuilder,
	time,
} from "discord.js";
import type { CommandFile } from "../../../lib/commandFile";
import { deletePluginRecord, getPluginsByServerId } from "../../../lib/db";
import { sendPaginationMessage } from "../../../lib/pagination";
import { getActivePlugins } from "../../../lib/serverInstance/plugin";
import {
	downloadPluginFile,
	getProjects,
	getVersionsBulk,
} from "../lib";

const MISSING_DELETE = "missing_delete";
const MISSING_REDOWNLOAD = "missing_redownload";
const MISSING_DISMISS = "missing_dismiss";

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

export default {
	command: new SlashCommandBuilder()
		.setName("listplugins")
		.setDescription(
			"Show all Modrinth-tracked plugins with version info and disk status",
		),

	requireServer: true,
	ephemeral: true,

	async execute({ interaction, server }) {
		// ── Build enriched list ───────────────────────────────────────────
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

		// ── Paginated embed ───────────────────────────────────────────────
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

		// ── Missing-plugin recovery prompt ────────────────────────────────
		const missing = enriched.filter((p) => !p.onDisk);
		if (missing.length === 0) return;

		// Only real Modrinth version IDs can be re-downloaded; synthetic ones
		// written by downloadModpackFile use "sha1:" / "mrpack:" prefixes.
		const redownloadable = missing.filter(
			(p) =>
				!p.versionId.startsWith("sha1:") &&
				!p.versionId.startsWith("mrpack:"),
		);
		const notRedownloadable = missing.length - redownloadable.length;

		// Trim the list to stay inside Discord's 2000-char limit.
		const MAX_LIST = 10;
		const listLines = missing
			.slice(0, MAX_LIST)
			.map((p) => `• \`${p.filename}\` (${p.projectName})`);
		if (missing.length > MAX_LIST)
			listLines.push(`…and ${missing.length - MAX_LIST} more`);

		const noteLines: string[] = [];
		if (notRedownloadable > 0)
			noteLines.push(
				`ℹ️ ${notRedownloadable} file(s) are not from Modrinth and cannot be re-downloaded — they will be skipped.`,
			);

		const prompt = await interaction.followUp({
			content: [
				`⚠️ **${missing.length} plugin(s) are missing from disk:**`,
				listLines.join("\n"),
				...noteLines,
				"\nWhat would you like to do?",
			].join("\n"),
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId(MISSING_REDOWNLOAD)
						.setLabel(`Re-download (${redownloadable.length})`)
						.setStyle(ButtonStyle.Primary)
						.setEmoji("🔄")
						.setDisabled(redownloadable.length === 0),
					new ButtonBuilder()
						.setCustomId(MISSING_DELETE)
						.setLabel(`Delete from DB (${missing.length})`)
						.setStyle(ButtonStyle.Danger)
						.setEmoji("🗑️"),
					new ButtonBuilder()
						.setCustomId(MISSING_DISMISS)
						.setLabel("Dismiss")
						.setStyle(ButtonStyle.Secondary),
				),
			],
			flags: MessageFlags.Ephemeral,
		});

		const btn = await prompt
			.awaitMessageComponent({
				componentType: ComponentType.Button,
				filter: (i) => i.user.id === interaction.user.id,
				time: 1000 * 60 * 5,
			})
			.catch(() => null);

		// Timed-out or dismissed — remove the buttons and exit cleanly.
		if (!btn || btn.customId === MISSING_DISMISS) {
			await prompt.edit({ components: [] });
			return;
		}

		await btn.deferUpdate();

		// ── Delete from DB ────────────────────────────────────────────────
		if (btn.customId === MISSING_DELETE) {
			await Promise.allSettled(
				missing.map((p) =>
					deletePluginRecord(p.projectId, p.versionId, server.id),
				),
			);
			await prompt.edit({
				content: `🗑️ Removed **${missing.length}** missing plugin record(s) from the database.`,
				components: [],
			});
			return;
		}

		// ── Re-download ───────────────────────────────────────────────────
		if (btn.customId === MISSING_REDOWNLOAD) {
			await prompt.edit({
				content: `🔄 Re-downloading **${redownloadable.length}** plugin(s)…`,
				components: [],
			});

			let succeeded = 0;
			const failedNames: string[] = [];

			for (const p of redownloadable) {
				const { newDownload } = await downloadPluginFile(
					server,
					p.versionId,
					true, // force-overwrite in case a zero-byte file is present
				);
				if (newDownload) {
					succeeded++;
				} else {
					failedNames.push(p.filename);
				}
			}

			const resultLines = [
				`✅ **${succeeded}** plugin(s) re-downloaded successfully.`,
			];
			if (failedNames.length > 0)
				resultLines.push(
					`❌ **${failedNames.length}** failed: ${failedNames.map((n) => `\`${n}\``).join(", ")}`,
				);
			if (notRedownloadable > 0)
				resultLines.push(
					`⏭️ **${notRedownloadable}** skipped (not from Modrinth).`,
				);

			await prompt.edit({ content: resultLines.join("\n") });
		}
	},

	features: {
		supportedPlatforms: ["minecraft"],
	},
} satisfies CommandFile<true>;
