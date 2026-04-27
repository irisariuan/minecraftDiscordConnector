import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";
import { basename } from "node:path";
import type { CommandFile } from "../lib/commandFile";
import {
	createRequestComponent,
	RequestComponentId,
} from "../lib/component/request";
import { getPluginsByServerId } from "../lib/db";
import {
	comparePermission,
	orPerm,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import {
	getActivePlugins,
	removePluginByFileName,
} from "../lib/serverInstance/plugin";

const CONFIRM_ID = "deleteallplugins_confirm";
const CANCEL_ID = "deleteallplugins_cancel";

/** Truncate a list of quoted names into a single string, appending an overflow note. */
function formatList(names: string[], max = 20): string {
	const shown = names.slice(0, max).map((n) => `\`${n}\``);
	const overflow = names.length - shown.length;
	return (
		shown.join(", ") + (overflow > 0 ? ` … and **${overflow}** more` : "")
	);
}

export default {
	command: new SlashCommandBuilder()
		.setName("deleteallplugins")
		.setDescription("Delete all plugin files from the server")
		.addBooleanOption((opt) =>
			opt
				.setName("include_untracked")
				.setDescription(
					"Also delete .jar files on disk that are not tracked in the database (default: false)",
				)
				.setRequired(false),
		),

	requireServer: true,

	async execute({ interaction, server }) {
		const includeUntracked =
			interaction.options.getBoolean("include_untracked") ?? false;

		// ── Phase 1: gather data ──────────────────────────────────────────────
		await interaction.editReply({
			content: "🔍 Scanning plugin directory…",
		});

		const [diskFiles, dbPlugins] = await Promise.all([
			getActivePlugins(server.config.pluginDir).catch(() => null),
			getPluginsByServerId(server.id),
		]);

		if (diskFiles === null) {
			return interaction.editReply({
				content: "❌ Failed to read the plugin directory.",
			});
		}

		// ── Phase 2: cross-reference disk vs DB ───────────────────────────────
		// Key: bare filename on disk (no extension). Value: tracked in DB?
		const dbFileNames = new Set(
			dbPlugins
				.map((p) => (p.filePath ? basename(p.filePath) : null))
				.filter(Boolean) as string[],
		);

		const trackedFiles: string[] = [];
		const untrackedFiles: string[] = [];

		for (const name of diskFiles) {
			if (dbFileNames.has(`${name}.jar`)) {
				trackedFiles.push(name);
			} else {
				untrackedFiles.push(name);
			}
		}

		const toDelete = includeUntracked
			? [...trackedFiles, ...untrackedFiles]
			: trackedFiles;

		if (toDelete.length === 0) {
			const hint =
				!includeUntracked && untrackedFiles.length > 0
					? `\n\n> ℹ️ **${untrackedFiles.length}** untracked file${untrackedFiles.length !== 1 ? "s" : ""} were skipped. Re-run with \`include_untracked: true\` to include them.`
					: "";
			return interaction.editReply({
				content: `✅ No plugins to delete.${hint}`,
			});
		}

		// ── Phase 3: build confirmation embed ────────────────────────────────
		const untrackedNote =
			untrackedFiles.length > 0 && !includeUntracked
				? `\n\n> ⚠️ **${untrackedFiles.length}** untracked file${untrackedFiles.length !== 1 ? "s" : ""} on disk will be skipped. Pass \`include_untracked: true\` to include them.`
				: "";

		const confirmEmbed = new EmbedBuilder()
			.setTitle("⚠️ Delete All Plugins")
			.setColor(0xe74c3c)
			.setDescription(
				`This will permanently delete **${toDelete.length}** plugin file${toDelete.length !== 1 ? "s" : ""} from \`${server.config.pluginDir}\`.${untrackedNote}`,
			)
			.addFields(
				{
					name: `🗑️ To be deleted (${toDelete.length})`,
					value: formatList(toDelete),
				},
				...(includeUntracked && untrackedFiles.length > 0
					? [
							{
								name: `📂 Untracked (${untrackedFiles.length})`,
								value: formatList(untrackedFiles),
								inline: false,
							},
						]
					: []),
			)
			.setFooter({ text: "This action cannot be undone." })
			.setTimestamp();

		const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(CONFIRM_ID)
				.setLabel(
					`Delete ${toDelete.length} plugin${toDelete.length !== 1 ? "s" : ""}`,
				)
				.setStyle(ButtonStyle.Danger),
			new ButtonBuilder()
				.setCustomId(CANCEL_ID)
				.setLabel("Cancel")
				.setStyle(ButtonStyle.Secondary),
		);

		// ── Phase 4: permission gate ──────────────────────────────────────────
		const hasPermission = comparePermission(
			await readPermission(interaction.user, server.id),
			PermissionFlags.deletePlugin,
		);

		if (hasPermission) {
			// Privileged user — self-confirm
			const msg = await interaction.editReply({
				embeds: [confirmEmbed],
				components: [confirmRow],
			});

			const click = await msg
				.awaitMessageComponent({
					filter: (i) => i.user.id === interaction.user.id,
					componentType: ComponentType.Button,
					time: 5 * 60 * 1000,
				})
				.catch(() => null);

			if (!click || click.customId === CANCEL_ID) {
				await (click
					? click.update({
							content: "🚫 Cancelled.",
							embeds: [],
							components: [],
						})
					: interaction.editReply({
							content: "🚫 Timed out — no action taken.",
							embeds: [],
							components: [],
						}));
				return;
			}

			await click.update({
				content: `⏳ Deleting **${toDelete.length}** plugin${toDelete.length !== 1 ? "s" : ""}…`,
				embeds: [],
				components: [],
			});
		} else {
			// Non-privileged user — request staff approval
			const approvalEmbed = new EmbedBuilder()
				.setTitle("🗑️ Delete All Plugins — Approval Required")
				.setColor(0xf39c12)
				.setDescription(
					`<@${interaction.user.id}> is requesting to delete **${toDelete.length}** plugin${toDelete.length !== 1 ? "s" : ""}.`,
				)
				.addFields({
					name: `Files to delete (${toDelete.length})`,
					value: formatList(toDelete),
				})
				.setFooter({ text: "Expires in 15 minutes." })
				.setTimestamp();

			const msg = await interaction.editReply({
				embeds: [approvalEmbed],
				components: [createRequestComponent()],
			});

			const reply = await msg
				.awaitMessageComponent({
					componentType: ComponentType.Button,
					filter: async (i) =>
						comparePermission(
							await readPermission(i.user, server.id),
							PermissionFlags.deletePlugin,
						),
					time: 15 * 60 * 1000,
				})
				.catch(() => null);

			if (!reply) {
				await interaction.editReply({
					content: "⏰ Request timed out — no action taken.",
					embeds: [],
					components: [],
				});
				return;
			}

			if (reply.customId === RequestComponentId.Deny) {
				await reply.update({
					content: "🚫 Request denied.",
					embeds: [],
					components: [],
				});
				return;
			}

			// Approved
			await reply.update({
				content: `⏳ Deleting **${toDelete.length}** plugin${toDelete.length !== 1 ? "s" : ""}…`,
				embeds: [],
				components: [],
			});
		}

		// ── Phase 5: execute deletions ────────────────────────────────────────
		const results = await Promise.all(
			toDelete.map(async (name) => ({
				name,
				ok: await removePluginByFileName(server.config.pluginDir, name),
			})),
		);

		const succeeded = results.filter((r) => r.ok).map((r) => r.name);
		const failed = results.filter((r) => !r.ok).map((r) => r.name);

		const resultEmbed = new EmbedBuilder()
			.setTitle("🗑️ Deletion Complete")
			.setColor(failed.length === 0 ? 0x2ecc71 : 0xf39c12)
			.addFields({
				name: `✅ Deleted (${succeeded.length})`,
				value: succeeded.length > 0 ? formatList(succeeded) : "*None*",
			})
			.setTimestamp();

		if (failed.length > 0) {
			resultEmbed.addFields({
				name: `⚠️ Failed (${failed.length})`,
				value: formatList(failed),
			});
		}

		await interaction.editReply({
			content: "",
			embeds: [resultEmbed],
			components: [],
		});
	},
	features: {
		requireStoppedServer: true,
	},
	permissions: orPerm(
		PermissionFlags.deletePlugin,
		PermissionFlags.voteDeletePlugin,
	),
} satisfies CommandFile<true>;
