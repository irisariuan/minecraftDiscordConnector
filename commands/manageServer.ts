import {
	ActionRowBuilder,
	bold,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	inlineCode,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { createServer, getAllServers } from "../lib/db";
import { andPerm, PermissionFlags } from "../lib/permission";
import { getAllGamePlugins, getGamePlugin } from "../lib/plugin/registry";
import {
	buildEditModalContentRow,
	collectInputFromModal,
	ModalComponentId,
} from "../lib/component/modal";
import { parsePorts, buildServerEmbed } from "../lib/component/serverBrowser";
import { runPhasedInput, type PhasedPhase } from "../lib/component/phasedInput";
import { readFile, writeFile } from "node:fs/promises";
import { joinPathWithBase } from "../lib/utils";
import type { DbServer } from "../lib/db";
import type { Prisma } from "../generated/prisma/client";
import { sendServerBrowser } from "../lib/serverBrowser";

export default {
	command: new SlashCommandBuilder()
		.setName("manageserver")
		.setDescription("Create or browse server instances")
		.addSubcommand((sub) =>
			sub
				.setName("create")
				.setDescription(
					"Register a new server instance in the database",
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("browse")
				.setDescription(
					"Browse, edit, and delete registered server instances",
				),
		),
	requireServer: false,
	permissions: andPerm(
		PermissionFlags.editSetting,
		PermissionFlags.serverModify,
		PermissionFlags.serverCreate,
	),
	async execute({ interaction, serverManager }) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const sub = interaction.options.getSubcommand(true);

		// ─── BROWSE ───────────────────────────────────────────────────────
		if (sub === "browse") {
			return sendServerBrowser(interaction, serverManager);
		}

		// ─── CREATE ───────────────────────────────────────────────────────
		if (sub === "create") {
			// ── Step 1: collect data via phased wizard ─────────────────────
			const gamePlugins = getAllGamePlugins();
			if (gamePlugins.length === 0) {
				return await interaction.editReply({
					content:
						"❌ No game plugins are loaded, so no server can be created. Enable a game plugin first.",
				});
			}

			const phases: PhasedPhase[] = [
				{
					label: "Server",
					description:
						"Set the absolute path to the server directory.",
					fields: [
						{
							id: "path",
							label: "Server Directory Path",
							description: "Absolute path to the server folder",
							required: true,
						},
					],
				},
				{
					label: "Game",
					description:
						"Choose the game plugin. Game-specific configuration can be set afterwards via that plugin's commands (e.g. /mcserver for Minecraft).",
					fields: [
						{
							id: "pluginId",
							label: "Game Plugin",
							type: "select" as const,
							selectOptions: gamePlugins.map((p) => ({
								label: p.displayName,
								value: p.id,
							})),
							required: true,
						},
						{
							id: "runtimeVersion",
							label: "Runtime Version (optional)",
							description: "Generic version label, if any",
							required: false,
						},
					],
				},
				{
					label: "Network & Identity",
					description:
						"Set the port(s) and an optional display tag.",
					fields: [
						{
							id: "port",
							label: "Port(s)",
							description:
								"Comma-separated integers between 1–65535",
							placeholder: "25565",
							required: false,
							defaultValue: "25565",
						},
						{
							id: "tag",
							label: "Display Tag",
							description:
								"Optional friendly name for this server",
							required: false,
						},
					],
					validate: (values) => {
						const portRaw = values.port?.trim() || "25565";
						if (!parsePorts(portRaw)) {
							return "Invalid port value(s). Provide a comma-separated list of integers between 1 and 65535.";
						}
						return null;
					},
				},
			];

			const phaseValues = await runPhasedInput({
				interaction,
				title: "New Server Setup",
				phases,
			});

			if (!phaseValues) return; // cancelled or timed out

			// ── Parse collected values ─────────────────────────────────────
			const path = phaseValues[0]!.path!;
			const pluginId = phaseValues[1]!.pluginId!;
			const runtimeVersion =
				phaseValues[1]!.runtimeVersion?.trim() || null;
			const portRaw = phaseValues[2]!.port?.trim() || "25565";
			const tagRaw = phaseValues[2]!.tag?.trim() || "";

			const ports = parsePorts(portRaw)!;
			const tag = tagRaw || null;

			// Seed config from the selected plugin's defaults (if any).
			const config = getGamePlugin(pluginId)?.defaultConfig?.() ?? {};

			// ── Review before creation ─────────────────────────────────────
			const previewServer: DbServer = {
				id: 0,
				tag,
				path,
				port: ports,
				startupScript: null,
				pluginId,
				runtimeVersion,
				config: config as DbServer["config"],
			};

			const reviewMessage = await interaction.editReply({
				content:
					"📋 Review your server configuration. Confirm to create or cancel to abort.",
				embeds: [buildServerEmbed(previewServer, null, 0, 1)],
				components: [
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setCustomId("ms_create_confirm")
							.setLabel("✅ Confirm & Create")
							.setStyle(ButtonStyle.Success),
						new ButtonBuilder()
							.setCustomId("ms_create_cancel")
							.setLabel("❌ Cancel")
							.setStyle(ButtonStyle.Secondary),
					),
				],
			});

			const confirmation = await reviewMessage
				.awaitMessageComponent({
					componentType: ComponentType.Button,
					filter: (i) => i.user.id === interaction.user.id,
					time: 1000 * 60 * 5,
				})
				.catch(() => null);

			if (!confirmation || confirmation.customId === "ms_create_cancel") {
				await interaction.editReply({
					content: "❌ Server creation cancelled.",
					embeds: [],
					components: [],
				});
				return;
			}

			await confirmation.deferUpdate();

			// ── Duplicate-path checks ──────────────────────────────────────
			const existing = await getAllServers();
			if (existing.some((s) => s.path === path)) {
				await interaction.editReply({
					content: `❌ A server with path ${inlineCode(path)} already exists.`,
					embeds: [],
					components: [],
				});
				return;
			}

			// ── Create & load ──────────────────────────────────────────────
			const newServer = await createServer({
				path,
				tag,
				port: ports,
				startupScript: null,
				pluginId,
				runtimeVersion,
				config: config as Prisma.InputJsonValue,
			});

			await serverManager.addOrReloadServer(newServer);

			// ── Offer startup-script edit ──────────────────────────────────
			const finalStartupScript = newServer.startupScript ?? "start.sh";

			const message = await interaction.editReply({
				content: `✅ Server ${bold(newServer.tag ?? `Server #${newServer.id}`)} (ID: ${bold(String(newServer.id))}) created and loaded successfully.`,
				embeds: [],
				components: [buildEditModalContentRow()],
			});

			const scriptCollector = message.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 1000 * 60 * 5,
				filter: (i) =>
					i.user.id === interaction.user.id &&
					i.customId === ModalComponentId.EditBtn,
			});

			scriptCollector.on("collect", async (i) => {
				const { content, interaction: modalInteraction } =
					await collectInputFromModal(
						i,
						await readFile(
							joinPathWithBase(
								newServer.path,
								finalStartupScript,
							) ?? finalStartupScript,
							"utf8",
						).catch(() => ""),
					);

				if (content !== null && modalInteraction !== null) {
					const scriptPath = joinPathWithBase(
						newServer.path,
						finalStartupScript,
					);
					if (!scriptPath) {
						await modalInteraction.editReply({
							content:
								"❌ Failed to determine safe path for custom startup script.",
						});
					} else {
						try {
							await writeFile(scriptPath, content, "utf8");
							await modalInteraction.editReply({
								content: `✅ Startup script ${inlineCode(finalStartupScript)} updated successfully.`,
							});
						} catch {
							await modalInteraction.editReply({
								content: `❌ Failed to write startup script to ${inlineCode(scriptPath)}.`,
							});
						}
					}
					scriptCollector.stop();
				}
			});

			scriptCollector.on("end", () => {
				message.edit({ components: [] }).catch(() => {});
			});

			return;
		}

		return await interaction.editReply({ content: "Unknown subcommand." });
	},
} satisfies CommandFile<false>;
