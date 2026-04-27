import {
	bold,
	EmbedBuilder,
	inlineCode,
	italic,
	MessageFlags,
	type ChatInputCommandInteraction,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import {
	runPhasedInput,
	type PhasedPhase,
} from "../../../../lib/component/phasedInput";
import {
	fetchVersionOptionsForLoader,
	KNOWN_LOADERS,
} from "../../../../lib/serverLoader";
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
import { rm, writeFile } from "node:fs/promises";

export function createSubcommandBuilder(sub: SlashCommandSubcommandBuilder) {
	return sub
		.setName("create")
		.setDescription("Download & set up a new Minecraft server");
}
export async function createHandler(
	params: ExecuteParams<ChatInputCommandInteraction>,
) {
	const { interaction, serverManager } = params;
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	// ── Collect inputs via phased wizard ────────────────────────────────────
	const phases: PhasedPhase[] = [
		{
			label: "Software",
			description:
				"Choose the server software and target Minecraft version.",
			fields: [
				{
					id: "loaderType",
					label: "Server Type",
					type: "select" as const,
					selectOptions: KNOWN_LOADERS.map((l) => ({
						label: l,
						value: l,
					})),
					required: true,
				},
				{
					id: "minecraftVersion",
					label: "Minecraft Version",
					type: "select" as const,
					loadOptions: (values) =>
						fetchVersionOptionsForLoader(values.loaderType ?? ""),
					required: true,
				},
			],
		},
		{
			label: "Paths",
			description:
				"Absolute filesystem paths for the server and plugins/mods directory.",
			fields: [
				{
					id: "serverdir",
					label: "Server Directory",
					description: "Absolute path to the server folder",
					required: true,
				},
				{
					id: "plugindir",
					label: "Plugin/Mods Directory",
					description: "Absolute path to the plugins/mods folder",
					required: true,
				},
			],
		},
		{
			label: "Identity",
			description:
				"Port(s), display tag, and optional loader version override.",
			fields: [
				{
					id: "port",
					label: "Port(s)",
					description: "Comma-separated integers between 1–65535",
					placeholder: "25565",
					required: false,
					defaultValue: "25565",
				},
				{
					id: "tag",
					label: "Display Tag",
					description: "Optional friendly name for this server",
					required: false,
				},
				{
					id: "loaderversion",
					label: "Loader Version Override",
					description:
						"Fabric loader / Forge version (leave blank for latest stable)",
					required: false,
				},
			],
			validate: (values) => {
				const portRaw = values.port?.trim() || "25565";
				const ports = portRaw
					.split(",")
					.map((p) => parseInt(p.trim()))
					.filter((p) => !isNaN(p) && p > 0 && p <= 65535);
				if (ports.length === 0) {
					return "Invalid port value(s). Provide comma-separated integers between 1 and 65535.";
				}
				return null;
			},
		},
	];

	const phaseValues = await runPhasedInput({
		interaction,
		title: "New Minecraft Server",
		phases,
	});
	if (!phaseValues) return; // cancelled or timed out

	const serverType = phaseValues[0]!.loaderType as ServerType;
	const mcVersion = phaseValues[0]!.minecraftVersion!;
	const serverDir = phaseValues[1]!.serverdir!;
	const pluginDir = phaseValues[1]!.plugindir!;
	const portRaw = phaseValues[2]!.port?.trim() || "25565";
	const tag = phaseValues[2]!.tag?.trim() || null;
	const loaderVersionOverride = phaseValues[2]!.loaderversion?.trim() || null;
	await interaction.editReply({ components: [], embeds: []})

	// Parse ports
	const ports = portRaw
		.split(",")
		.map((p) => parseInt(p.trim()))
		.filter((p) => !isNaN(p) && p > 0 && p <= 65535);

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
	interaction.followUp(
		"You can always edit the startup script using /manageServer",
	);
}
