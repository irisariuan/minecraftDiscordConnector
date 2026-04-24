import { ComponentType, SlashCommandBuilder } from "discord.js";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { CommandFile } from "../../../lib/commandFile";
import {
	createRequestComponent,
	RequestComponentId,
} from "../../../lib/component/request";
import {
	orPerm,
	comparePermission,
	PermissionFlags,
	readPermission,
} from "../../../lib/permission";
import { getPluginsByServerId, deletePluginRecord } from "../../../lib/db";
import { safeJoin } from "../../../lib/utils";
import { downloadPluginFile, listPluginVersions } from "../lib";

export default {
	command: new SlashCommandBuilder()
		.setName("updateplugins")
		.setDescription(
			"Check for updates for plugins saved in the database and apply them",
		),
	requireServer: true,
	async execute({ interaction, server }) {
		await interaction.editReply({
			content: "Checking for plugin updates...",
		});

		// Fetch all plugins tracked for this server
		const plugins = await getPluginsByServerId(server.id);

		if (plugins.length === 0) {
			return await interaction.editReply({
				content:
					"No plugins are tracked in the database for this server.",
			});
		}

		// Deduplicate: one entry per projectId, keep the most recently updated record
		const latestByProject = new Map<string, (typeof plugins)[number]>();
		for (const plugin of plugins) {
			const existing = latestByProject.get(plugin.projectId);
			if (!existing || plugin.updatedAt > existing.updatedAt) {
				latestByProject.set(plugin.projectId, plugin);
			}
		}

		// Check each tracked plugin against Modrinth for a newer version
		type UpdateEntry = {
			plugin: (typeof plugins)[number];
			newVersionId: string;
			newFilename: string;
		};

		const updates: UpdateEntry[] = [];
		const failedChecks: string[] = [];

		for (const [projectId, plugin] of latestByProject.entries()) {
			const versions = await listPluginVersions(projectId, {
				loaders: [server.config.loaderType],
				game_versions: [server.config.minecraftVersion],
			});

			if (!versions || versions.length === 0) {
				failedChecks.push(projectId);
				continue;
			}

			// Modrinth returns versions sorted newest-first
			const latest = versions[0];
			if (!latest) {
				failedChecks.push(projectId);
				continue;
			}
			if (latest.id !== plugin.versionId) {
				updates.push({
					plugin,
					newVersionId: latest.id,
					newFilename: latest.files[0]?.filename ?? "unknown",
				});
			}
		}

		if (updates.length === 0) {
			let content = "All tracked plugins are already up to date!";
			if (failedChecks.length > 0) {
				content += `\n\nCould not fetch version info for ${failedChecks.length} plugin(s): ${failedChecks.map((id) => `\`${id}\``).join(", ")}`;
			}
			return await interaction.editReply({ content });
		}

		const updateSummary = updates
			.map(
				(u) =>
					`- \`${u.plugin.projectId}\`: \`${u.plugin.versionId}\` → \`${u.newVersionId}\` (\`${u.newFilename}\`)`,
			)
			.join("\n");

		const hasPermission = comparePermission(
			await readPermission(interaction.user, server.id),
			PermissionFlags.downloadPlugin,
		);

		if (!hasPermission) {
			const message = await interaction.editReply({
				content: `The following plugins have updates available:\n${updateSummary}\n\nPlease ask a staff member to approve applying these updates.`,
				components: [createRequestComponent()],
			});

			const reply = await message
				.awaitMessageComponent({
					componentType: ComponentType.Button,
					filter: async (i) =>
						comparePermission(
							await readPermission(i.user, server.id),
							PermissionFlags.downloadPlugin,
						),
					time: 15 * 60 * 1000,
				})
				.catch(() => null);

			if (!reply) {
				return await interaction.editReply({
					content: "Plugin update request timed out.",
					components: [],
				});
			}

			if (reply.customId === RequestComponentId.Deny) {
				return await interaction.editReply({
					content: "Plugin update request was denied.",
					components: [],
				});
			}

			await interaction.editReply({
				content: `Update approved. Applying ${updates.length} update(s)...`,
				components: [],
			});
		} else {
			await interaction.editReply({
				content: `The following plugins have updates available:\n${updateSummary}\n\nApplying updates...`,
			});
		}

		// Apply each update
		const successUpdates: string[] = [];
		const failedUpdates: string[] = [];

		for (const { plugin, newVersionId } of updates) {
			const { filename } = await downloadPluginFile(
				server,
				newVersionId,
				true,
			);

			if (!filename) {
				failedUpdates.push(plugin.projectId);
				continue;
			}

			// Remove the old file only when its path differs from the new one
			const newFilePath = safeJoin(server.config.pluginDir, filename);
			if (
				plugin.filePath &&
				plugin.filePath !== newFilePath &&
				existsSync(plugin.filePath)
			) {
				await rm(plugin.filePath).catch(() => {});
			}

			// Remove the old DB record (the new one was upserted by downloadPluginFile)
			await deletePluginRecord(
				plugin.projectId,
				plugin.versionId,
				server.id,
			);

			successUpdates.push(`\`${plugin.projectId}\` → \`${filename}\``);
		}

		// Build result message
		const resultParts: string[] = [];

		if (successUpdates.length > 0) {
			resultParts.push(
				`**Successfully updated (${successUpdates.length}):**\n${successUpdates.map((s) => `- ${s}`).join("\n")}`,
			);
		}
		if (failedUpdates.length > 0) {
			resultParts.push(
				`**Failed to update (${failedUpdates.length}):**\n${failedUpdates.map((id) => `- \`${id}\``).join("\n")}`,
			);
		}
		if (failedChecks.length > 0) {
			resultParts.push(
				`**Could not check for updates (${failedChecks.length}):**\n${failedChecks.map((id) => `- \`${id}\``).join("\n")}`,
			);
		}

		const finalContent =
			resultParts.join("\n\n") +
			(successUpdates.length > 0
				? "\n\nRestart the server for the changes to take effect."
				: "");

		await interaction.editReply({ content: finalContent });
	},
	permissions: orPerm(
		PermissionFlags.downloadPlugin,
		PermissionFlags.voteDownloadPlugin,
	),
	features: {
		supportedPlatforms: ["minecraft"],
	},
} satisfies CommandFile<true>;
