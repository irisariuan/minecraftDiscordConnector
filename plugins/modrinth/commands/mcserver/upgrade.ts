import {
	ActionRowBuilder,
	bold,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	inlineCode,
	MessageFlags,
	type ChatInputCommandInteraction,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import type { ExecuteParams } from "../../../../lib/commandFile";
import { existsSync } from "node:fs";
import { selectServerById, updateServer } from "../../../../lib/db";
import { getPaperVersionBuild } from "../../../../lib/serverInstance/jar";
import { safeJoin } from "../../../../lib/utils";
import { downloadAndSave } from "../../../../lib/utils/web";
import {
	checkPluginCompatibility,
	buildCompatEmbed,
	getVanillaServerUrl,
	findJarsByPrefix,
	getLatestStableFabricLoader,
	getLatestStableFabricInstaller,
	fabricServerJarUrl,
	getForgePromo,
	forgeInstallerUrl,
	runForgeInstaller,
	writeStartScript,
} from "../../lib";
import type { ServerType } from "../../types";
import { rm } from "node:fs/promises";

export function upgradeSubcommandBuilder(sub: SlashCommandSubcommandBuilder) {
	return sub
		.setName("upgrade")
		.setDescription("Upgrade an existing server to a new Minecraft version")
		.addStringOption((o) =>
			o
				.setName("server")
				.setDescription("Server to upgrade")
				.setRequired(true)
				.setAutocomplete(true),
		)
		.addStringOption((o) =>
			o
				.setName("version")
				.setDescription("Target Minecraft version, e.g. 1.21.4")
				.setRequired(true)
				.setAutocomplete(true),
		)
		.addStringOption((o) =>
			o
				.setName("loader_version")
				.setDescription(
					"Fabric loader / Forge version override (defaults to latest stable)",
				)
				.setRequired(false),
		);
}
export async function upgradeHandler(
	params: ExecuteParams<ChatInputCommandInteraction>,
) {
	const { interaction, serverManager } = params;
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const serverIdRaw = interaction.options.getString("server", true);
	const newVersion = interaction.options.getString("version", true);
	const loaderVersionOverride =
		interaction.options.getString("loader_version");

	const serverId = parseInt(serverIdRaw);
	if (isNaN(serverId)) {
		return interaction.editReply({
			content: "❌ Invalid server selection.",
		});
	}

	const dbServer = await selectServerById(serverId);
	if (!dbServer) {
		return interaction.editReply({
			content: `❌ Server with ID ${inlineCode(String(serverId))} not found.`,
		});
	}

	const inMemServer = serverManager.getServer(serverId);
	if (inMemServer && (await inMemServer.isOnline.getData(true))) {
		return interaction.editReply({
			content: `❌ ${bold(dbServer.tag ?? `Server #${dbServer.id}`)} is currently ${bold("online")}. Stop the server before upgrading.`,
		});
	}

	const serverType = dbServer.loaderType as ServerType;
	const serverTag = dbServer.tag ?? `Server #${dbServer.id}`;
	const serverDir = dbServer.path;

	await interaction.editReply({
		content: `🔍 Checking plugin/mod compatibility for upgrade to ${bold(newVersion)}…`,
	});

	// ── Compatibility check ─────────────────────────────────────────
	const compatResults = await checkPluginCompatibility(
		serverId,
		newVersion,
		serverType,
	);

	// ── Build compat embed with confirm/cancel ──────────────────────
	const hasIncompat = compatResults.some((r) => r.compatible === false);

	const confirmBtn = new ButtonBuilder()
		.setCustomId("mcserver_upgrade_confirm")
		.setLabel(hasIncompat ? "Upgrade anyway" : "Upgrade")
		.setStyle(hasIncompat ? ButtonStyle.Danger : ButtonStyle.Success)
		.setEmoji("⬆️");

	const cancelBtn = new ButtonBuilder()
		.setCustomId("mcserver_upgrade_cancel")
		.setLabel("Cancel")
		.setStyle(ButtonStyle.Secondary);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		confirmBtn,
		cancelBtn,
	);

	const compatEmbed =
		compatResults.length > 0
			? buildCompatEmbed(compatResults, serverTag, newVersion)
			: new EmbedBuilder()
					.setTitle(`⬆️ Upgrade ${serverTag} → ${newVersion}`)
					.setDescription(
						"No plugins/mods are tracked for this server. The server JAR will be replaced.",
					)
					.setColor(0x3498db)
					.setTimestamp();

	const confirmMsg = await interaction.editReply({
		content: "",
		embeds: [compatEmbed],
		components: [row],
	});

	// ── Wait for user decision ──────────────────────────────────────
	const buttonResponse = await confirmMsg
		.awaitMessageComponent({
			componentType: ComponentType.Button,
			filter: (i) => i.user.id === interaction.user.id,
			time: 1000 * 60 * 5,
		})
		.catch(() => null);

	if (!buttonResponse) {
		await interaction.editReply({
			content: "⏱️ Upgrade timed out.",
			embeds: [],
			components: [],
		});
		return;
	}

	await buttonResponse.deferUpdate();

	if (buttonResponse.customId === "mcserver_upgrade_cancel") {
		await interaction.editReply({
			content: "❌ Upgrade cancelled.",
			embeds: [],
			components: [],
		});
		return;
	}

	// ── Perform upgrade ─────────────────────────────────────────────
	await interaction.editReply({
		content: `⏳ Downloading ${bold(serverType)} server JAR for ${bold(newVersion)}…`,
		embeds: [],
		components: [],
	});

	let newJarName: string | null = null;
	let newStartupScript: string | null = null;

	try {
		if (serverType === "vanilla") {
			const url = await getVanillaServerUrl(newVersion);
			if (!url) {
				return interaction.editReply({
					content: `❌ Could not find Vanilla download for ${bold(newVersion)}.`,
				});
			}
			newJarName = "server.jar";
			await downloadAndSave(url, safeJoin(serverDir, newJarName));
		} else if (serverType === "paper") {
			const build = await getPaperVersionBuild("paper", newVersion, {
				latest: true,
			});
			if (!build) {
				return interaction.editReply({
					content: `❌ No Paper build found for Minecraft ${bold(newVersion)}.`,
				});
			}
			const downloadEntry =
				Object.entries(build.downloads).find(([k]) =>
					k.toLowerCase().includes("application"),
				) ?? Object.entries(build.downloads)[0];
			if (!downloadEntry || !downloadEntry[1][0]) {
				return interaction.editReply({
					content: "❌ Paper build has no downloadable file.",
				});
			}
			const paperFile = downloadEntry[1][0];
			newJarName = paperFile.name;

			// Remove old paper JARs
			const oldPaperJars = await findJarsByPrefix(serverDir, "paper-");
			for (const old of oldPaperJars) {
				if (old !== newJarName)
					await rm(safeJoin(serverDir, old)).catch(() => {});
			}

			await downloadAndSave(
				paperFile.url,
				safeJoin(serverDir, newJarName),
			);
		} else if (serverType === "fabric") {
			const loaderVer =
				loaderVersionOverride ?? (await getLatestStableFabricLoader());
			const installerVer = await getLatestStableFabricInstaller();
			if (!loaderVer || !installerVer) {
				return interaction.editReply({
					content:
						"❌ Could not fetch Fabric loader / installer versions.",
				});
			}
			newJarName = "fabric-server-launch.jar";
			await downloadAndSave(
				fabricServerJarUrl(newVersion, loaderVer, installerVer),
				safeJoin(serverDir, newJarName),
			);
		} else if (serverType === "forge") {
			const { recommended, latest } = await getForgePromo(newVersion);
			const forgeVer = loaderVersionOverride ?? recommended ?? latest;
			if (!forgeVer) {
				return interaction.editReply({
					content: `❌ No Forge version found for Minecraft ${bold(newVersion)}. Try specifying \`loader_version\` manually.`,
				});
			}

			const installerJar = `forge-${newVersion}-${forgeVer}-installer.jar`;
			const installerPath = safeJoin(serverDir, installerJar);

			await interaction.editReply({
				content: `⏳ Running Forge installer for ${bold(newVersion)}…`,
			});
			await downloadAndSave(
				forgeInstallerUrl(newVersion, forgeVer),
				installerPath,
			);
			const { ok, output } = await runForgeInstaller(
				installerPath,
				serverDir,
			);
			await rm(installerPath).catch(() => {});

			if (!ok) {
				return interaction.editReply({
					content: `❌ Forge installer failed.\n\`\`\`\n${output.slice(0, 1800)}\n\`\`\``,
				});
			}

			if (existsSync(safeJoin(serverDir, "run.sh"))) {
				newStartupScript = "./run.sh";
			} else {
				const forgeJars = await findJarsByPrefix(
					serverDir,
					`forge-${newVersion}-`,
				);
				newJarName =
					forgeJars.find((j) => !j.includes("installer")) ?? null;
			}
		}
	} catch (err) {
		return interaction.editReply({
			content: `❌ Download / install error: ${String(err)}`,
		});
	}

	if (!newJarName && !newStartupScript) {
		return interaction.editReply({
			content:
				"❌ Could not determine new server JAR after installation.",
		});
	}

	// ── Update start.sh ─────────────────────────────────────────────
	if (!newStartupScript && newJarName) {
		await writeStartScript(serverDir, newJarName).catch(() => {});
	}

	// ── Update DB record ────────────────────────────────────────────
	try {
		const updated = await updateServer(serverId, {
			version: newVersion,
			...(newStartupScript !== null && {
				startupScript: newStartupScript,
			}),
		});
		await serverManager.addOrReloadServer(updated);
	} catch (err) {
		await interaction.editReply({
			content: `⚠️ JAR was replaced but failed to update the database: ${String(err)}`,
		});
		return;
	}

	// ── Summary ─────────────────────────────────────────────────────
	const incompatCount = compatResults.filter(
		(r) => r.compatible === false,
	).length;
	const unknownCount = compatResults.filter(
		(r) => r.compatible === null,
	).length;

	const summaryEmbed = new EmbedBuilder()
		.setTitle("✅ Server Upgraded")
		.setColor(0x2ecc71)
		.setDescription(
			`${bold(serverTag)} has been upgraded to Minecraft ${bold(newVersion)}.`,
		)
		.addFields(
			{
				name: "Server type",
				value: inlineCode(serverType),
				inline: true,
			},
			{
				name: "New version",
				value: inlineCode(newVersion),
				inline: true,
			},
			{
				name: "New JAR / script",
				value: inlineCode(newStartupScript ?? newJarName ?? "?"),
				inline: true,
			},
		)
		.setTimestamp();

	if (compatResults.length > 0) {
		summaryEmbed.addFields({
			name: "Plugin/mod compatibility",
			value: [
				`✅ Compatible: ${compatResults.filter((r) => r.compatible === true).length}`,
				`❌ Incompatible: ${incompatCount}`,
				`❓ Unknown: ${unknownCount}`,
			].join(" · "),
		});
	}

	if (incompatCount > 0 || unknownCount > 0) {
		summaryEmbed.setFooter({
			text: "⚠️ Some plugins/mods may not work. Review them before starting the server.",
		});
	}

	return interaction.editReply({
		content: "",
		embeds: [summaryEmbed],
		components: [],
	});
}
