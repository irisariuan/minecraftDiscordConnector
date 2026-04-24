import {
	bold,
	EmbedBuilder,
	inlineCode,
	italic,
	MessageFlags,
	type ChatInputCommandInteraction,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import { existsSync } from "node:fs";
import { getAllServers, createServer } from "../../../../lib/db";
import {
	getPaperProject,
	findHighestAvailableVersion,
	getPaperVersionBuild,
} from "../../../../lib/serverInstance/jar";
import { safeJoin } from "../../../../lib/utils";
import { downloadAndSave } from "../../../../lib/utils/web";
import {
	ensureDir,
	getVanillaServerUrl,
	getLatestStableFabricLoader,
	getLatestStableFabricInstaller,
	fabricServerJarUrl,
	getForgePromo,
	forgeInstallerUrl,
	runForgeInstaller,
	findJarsByPrefix,
	writeEula,
	writeStartScript,
} from "../../lib";
import type { ServerType } from "../../types";
import type { ExecuteParams } from "../../../../lib/commandFile";

export function createSubcommandBuilder(sub: SlashCommandSubcommandBuilder) {
	return sub
		.setName("create")
		.setDescription("Download & set up a new Minecraft server")
		.addStringOption((o) =>
			o
				.setName("servertype")
				.setDescription(
					"Server software to use (vanilla / paper / fabric / forge)",
				)
				.setRequired(true)
				.addChoices(
					{ name: "Vanilla", value: "vanilla" },
					{ name: "Paper", value: "paper" },
					{ name: "Fabric", value: "fabric" },
					{ name: "Forge", value: "forge" },
				),
		)
		.addStringOption((o) =>
			o
				.setName("minecraftversion")
				.setDescription("Minecraft version, e.g. 1.21.1")
				.setRequired(true)
				.setAutocomplete(true),
		)
		.addStringOption((o) =>
			o
				.setName("serverdir")
				.setDescription(
					"Absolute path to the server directory (will be created if missing)",
				)
				.setRequired(true),
		)
		.addStringOption((o) =>
			o
				.setName("plugindir")
				.setDescription(
					"Absolute path to the plugins/mods directory (will be created if missing)",
				)
				.setRequired(true),
		)
		.addStringOption((o) =>
			o
				.setName("tag")
				.setDescription("Display name for the server")
				.setRequired(false),
		)
		.addStringOption((o) =>
			o
				.setName("port")
				.setDescription("Comma-separated ports (default: 25565)")
				.setRequired(false),
		)
		.addStringOption((o) =>
			o
				.setName("loaderversion")
				.setDescription(
					"Fabric loader / Forge version override (defaults to latest stable)",
				)
				.setRequired(false),
		);
}
export async function createHandler(
	params: ExecuteParams<ChatInputCommandInteraction>,
) {
	const { interaction, serverManager } = params;
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const serverType = interaction.options.getString(
		"servertype",
		true,
	) as ServerType;
	const mcVersion = interaction.options.getString("minecraftversion", true);
	const serverDir = interaction.options.getString("serverdir", true);
	const pluginDir = interaction.options.getString("plugindir", true);
	const tag = interaction.options.getString("tag");
	const portRaw = interaction.options.getString("port") ?? "25565";
	const loaderVersionOverride =
		interaction.options.getString("loaderversion");

	// Parse ports
	const ports = portRaw
		.split(",")
		.map((p) => parseInt(p.trim()))
		.filter((p) => !isNaN(p) && p > 0 && p <= 65535);
	if (ports.length === 0) {
		return interaction.editReply({
			content:
				"❌ Invalid port value(s). Provide comma-separated integers between 1 and 65535.",
		});
	}

	// Check for duplicate server paths
	const existing = await getAllServers();
	if (existing.some((s) => s.path === serverDir)) {
		return interaction.editReply({
			content: `❌ A server with path ${inlineCode(serverDir)} is already registered.`,
		});
	}

	await interaction.editReply({
		content: `⏳ Setting up a ${bold(serverType)} server for Minecraft ${bold(mcVersion)}…`,
	});

	// ── Create directories ──────────────────────────────────────────
	try {
		await ensureDir(serverDir);
		await ensureDir(pluginDir);
	} catch (err) {
		return interaction.editReply({
			content: `❌ Failed to create directories: ${String(err)}`,
		});
	}

	// ── Download / install server JAR ───────────────────────────────
	let jarName: string | null = null;
	let startupScript: string | null = null;

	try {
		if (serverType === "vanilla") {
			const url = await getVanillaServerUrl(mcVersion);
			if (!url) {
				return interaction.editReply({
					content: `❌ Could not find Vanilla server download for ${bold(mcVersion)}.`,
				});
			}
			jarName = "server.jar";
			await downloadAndSave(url, safeJoin(serverDir, jarName));
		} else if (serverType === "paper") {
			const proj = await getPaperProject("paper");
			if (!proj) {
				return interaction.editReply({
					content: "❌ Could not reach the PaperMC API.",
				});
			}
			const matchedKey = findHighestAvailableVersion(
				mcVersion,
				proj.versions,
			);
			if (!matchedKey) {
				return interaction.editReply({
					content: `❌ No Paper build found for Minecraft ${bold(mcVersion)}.`,
				});
			}
			const build = await getPaperVersionBuild("paper", mcVersion, {
				latest: true,
			});
			if (!build) {
				return interaction.editReply({
					content: `❌ Could not fetch the latest Paper build for ${bold(mcVersion)}.`,
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
			jarName = paperFile.name;
			await downloadAndSave(paperFile.url, safeJoin(serverDir, jarName));
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
			jarName = "fabric-server-launch.jar";
			await downloadAndSave(
				fabricServerJarUrl(mcVersion, loaderVer, installerVer),
				safeJoin(serverDir, jarName),
			);
			// Fabric also needs a fabric-server-launcher.properties
			const { writeFile } = await import("node:fs/promises");
			await writeFile(
				safeJoin(serverDir, "fabric-server-launcher.properties"),
				`serverJar=server.jar\n`,
			);
		} else if (serverType === "forge") {
			const { recommended, latest } = await getForgePromo(mcVersion);
			const forgeVer = loaderVersionOverride ?? recommended ?? latest;
			if (!forgeVer) {
				return interaction.editReply({
					content: `❌ No Forge version found for Minecraft ${bold(mcVersion)}. Try specifying \`loaderversion\` manually.`,
				});
			}
			const installerJar = `forge-${mcVersion}-${forgeVer}-installer.jar`;
			const installerPath = safeJoin(serverDir, installerJar);

			await interaction.editReply({
				content: `⏳ Downloading Forge ${bold(forgeVer)} installer for ${bold(mcVersion)}…`,
			});
			await downloadAndSave(
				forgeInstallerUrl(mcVersion, forgeVer),
				installerPath,
			);

			await interaction.editReply({
				content: `⏳ Running Forge installer (this may take a minute)…`,
			});
			const { ok, output } = await runForgeInstaller(
				installerPath,
				serverDir,
			);

			const { rm } = await import("node:fs/promises");
			await rm(installerPath).catch(() => {});

			if (!ok) {
				return interaction.editReply({
					content: `❌ Forge installer exited with an error.\n\`\`\`\n${output.slice(0, 1800)}\n\`\`\``,
				});
			}

			if (existsSync(safeJoin(serverDir, "run.sh"))) {
				startupScript = "./run.sh";
			} else {
				const forgeJars = await findJarsByPrefix(
					serverDir,
					`forge-${mcVersion}-`,
				);
				jarName =
					forgeJars.find((j) => !j.includes("installer")) ?? null;
			}
		}
	} catch (err) {
		return interaction.editReply({
			content: `❌ Download / install error: ${String(err)}`,
		});
	}

	if (!jarName && !startupScript) {
		return interaction.editReply({
			content:
				"❌ Could not determine server JAR file after installation.",
		});
	}

	// ── eula.txt & start.sh ─────────────────────────────────────────
	await writeEula(serverDir).catch(() => {});
	if (!startupScript && jarName) {
		await writeStartScript(serverDir, jarName).catch(() => {});
	}

	// ── Loader / mod type ───────────────────────────────────────────
	const loaderType = serverType;
	const modType =
		serverType === "paper"
			? "plugin"
			: serverType === "vanilla"
				? "none"
				: "mod";

	// ── Register in DB ──────────────────────────────────────────────
	let newServer;
	try {
		newServer = await createServer({
			path: serverDir,
			pluginPath: pluginDir,
			version: mcVersion,
			loaderType,
			modType,
			tag: tag ?? null,
			port: ports,
			apiPort: null,
			gameType: "minecraft",
			startupScript: startupScript ?? null,
		});
	} catch (err) {
		return interaction.editReply({
			content: `❌ Server JAR was set up but failed to register in the database: ${String(err)}`,
		});
	}

	await serverManager.addOrReloadServer(newServer);

	const embed = new EmbedBuilder()
		.setTitle("✅ Minecraft Server Created")
		.setColor(0x2ecc71)
		.setDescription(
			`${bold(serverType.charAt(0).toUpperCase() + serverType.slice(1))} server for Minecraft ${bold(mcVersion)} is ready.`,
		)
		.addFields(
			{
				name: "Server ID",
				value: inlineCode(String(newServer.id)),
				inline: true,
			},
			{
				name: "Tag",
				value: newServer.tag
					? inlineCode(newServer.tag)
					: italic("none"),
				inline: true,
			},
			{ name: "Server directory", value: inlineCode(serverDir) },
			{
				name: "Plugin/mod directory",
				value: inlineCode(pluginDir),
			},
			{
				name: "JAR / startup",
				value: inlineCode(startupScript ?? jarName ?? "?"),
			},
			{
				name: "Port(s)",
				value: inlineCode(ports.join(", ")),
				inline: true,
			},
		)
		.setFooter({
			text: "Use /startserver to start the server when ready.",
		})
		.setTimestamp();

	interaction.editReply({ content: "", embeds: [embed] });
	interaction.followUp('You can always edit the startup script using /manageServer')
}
