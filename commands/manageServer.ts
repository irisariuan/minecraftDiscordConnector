import {
	bold,
	ComponentType,
	inlineCode,
	italic,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	createServer,
	deleteServer,
	getAllServers,
	selectServerById,
	updateServer,
	type DbServer,
} from "../lib/db";
import { andPerm, PermissionFlags } from "../lib/permission";
import { serverGameTypes } from "../lib/server";
import {
	buildEditModalContentRow,
	collectInputFromModal,
	ModalComponentId,
} from "../lib/component/modal";
import { readFile, writeFile } from "node:fs/promises";
import { joinPathWithBase } from "../lib/utils";
import { readFileSync } from "node:fs";
import { getUserSelectedServer } from "../lib/component/server";

export default {
	command: new SlashCommandBuilder()
		.setName("manageserver")
		.setDescription("Create, edit, list, or delete server instances")
		.addSubcommand((sub) =>
			sub
				.setName("create")
				.setDescription(
					"Register a new server instance in the database",
				)
				.addStringOption((o) =>
					o
						.setName("path")
						.setDescription("Absolute path to the server directory")
						.setRequired(true),
				)
				.addStringOption((o) =>
					o
						.setName("pluginpath")
						.setDescription(
							"Absolute path to the plugins directory",
						)
						.setRequired(true),
				)
				.addStringOption((o) =>
					o
						.setName("version")
						.setDescription("Game version (e.g. 1.21.1)")
						.setRequired(true),
				)
				.addStringOption((o) =>
					o
						.setName("loadertype")
						.setDescription(
							"Loader type (e.g. paper, fabric, forge)",
						)
						.setRequired(true),
				)
				.addStringOption((o) =>
					o
						.setName("modtype")
						.setDescription("Mod type (e.g. plugin, mod, none)")
						.setRequired(true),
				)
				.addStringOption((o) =>
					o
						.setName("tag")
						.setDescription("Display name / tag for the server")
						.setRequired(false),
				)
				.addStringOption((o) =>
					o
						.setName("port")
						.setDescription(
							"Comma-separated port numbers (default: 25565)",
						)
						.setRequired(false),
				)
				.addIntegerOption((o) =>
					o
						.setName("apiport")
						.setDescription("Internal API port (optional)")
						.setRequired(false),
				)
				.addStringOption((o) =>
					o
						.setName("gametype")
						.setDescription("Game type (default: minecraft)")
						.setRequired(false)
						.setAutocomplete(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("edit")
				.setDescription("Edit an existing server instance")
				.addStringOption((o) =>
					o
						.setName("path")
						.setDescription("New server directory path")
						.setRequired(false),
				)
				.addStringOption((o) =>
					o
						.setName("pluginpath")
						.setDescription("New plugins directory path")
						.setRequired(false),
				)
				.addStringOption((o) =>
					o
						.setName("version")
						.setDescription("New game version")
						.setRequired(false),
				)
				.addStringOption((o) =>
					o
						.setName("loadertype")
						.setDescription("New loader type")
						.setRequired(false),
				)
				.addStringOption((o) =>
					o
						.setName("modtype")
						.setDescription("New mod type")
						.setRequired(false),
				)
				.addStringOption((o) =>
					o
						.setName("tag")
						.setDescription("New display tag (use 'null' to clear)")
						.setRequired(false),
				)
				.addStringOption((o) =>
					o
						.setName("port")
						.setDescription("Comma-separated port numbers")
						.setRequired(false),
				)
				.addIntegerOption((o) =>
					o
						.setName("apiport")
						.setDescription("New API port (-1 to clear)")
						.setRequired(false),
				)
				.addStringOption((o) =>
					o
						.setName("gametype")
						.setDescription("New game type")
						.setRequired(false)
						.setAutocomplete(true),
				)
				.addStringOption((o) =>
					o
						.setName("startupscript")
						.setDescription(
							"New startup script path (use 'null' to reset to default ./start.sh)",
						)
						.setRequired(false),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("list")
				.setDescription("List all registered server instances"),
		)
		.addSubcommand((sub) =>
			sub
				.setName("delete")
				.setDescription(
					"Delete a server instance from the database (server must be offline)",
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

		// ─── LIST ─────────────────────────────────────────────────────────
		if (sub === "list") {
			const servers = await getAllServers();
			if (servers.length === 0) {
				return await interaction.editReply({
					content: "No servers found in the database.",
				});
			}

			const lines = servers.map((s) => {
				const inMemory = serverManager.getServer(s.id);
				const statusLabel = inMemory
					? italic("loaded")
					: italic("not loaded");

				return [
					`${bold(`[${s.id}] ${s.tag ?? `Server #${s.id}`}`)} — ${statusLabel}`,
					formatServerSummary(s),
				].join("\n");
			});

			const content = lines.join("\n\n");
			return await interaction.editReply({
				content:
					content.length > 2000
						? `${content.slice(0, 1990)}…`
						: content,
			});
		}

		// ─── CREATE ───────────────────────────────────────────────────────
		if (sub === "create") {
			const path = interaction.options.getString("path", true);
			const pluginPath = interaction.options.getString(
				"pluginpath",
				true,
			);
			const version = interaction.options.getString("version", true);
			const loaderType = interaction.options.getString(
				"loadertype",
				true,
			);
			const modType = interaction.options.getString("modtype", true);
			const tag = interaction.options.getString("tag") ?? null;
			const portRaw = interaction.options.getString("port") ?? "25565";
			const apiPort = interaction.options.getInteger("apiport") ?? null;
			const gameType =
				interaction.options.getString("gametype") ?? "minecraft";
			const startupScriptRaw =
				interaction.options.getString("startupscript") ?? null;

			const ports = parsePorts(portRaw);
			if (!ports) {
				return await interaction.editReply({
					content:
						"Invalid port value(s). Provide a comma-separated list of integers between 1 and 65535.",
				});
			}

			if (!serverGameTypes.includes(gameType as never)) {
				return await interaction.editReply({
					content: `Invalid game type. Allowed: ${serverGameTypes.join(", ")}.`,
				});
			}

			const existing = await getAllServers();
			if (existing.some((s) => s.path === path)) {
				return await interaction.editReply({
					content: `A server with path ${inlineCode(path)} already exists.`,
				});
			}
			if (existing.some((s) => s.pluginPath === pluginPath)) {
				return await interaction.editReply({
					content: `A server with plugin path ${inlineCode(pluginPath)} already exists.`,
				});
			}

			const newServer = await createServer({
				path,
				pluginPath,
				version,
				loaderType,
				modType,
				tag,
				port: ports,
				apiPort,
				gameType,
				startupScript: startupScriptRaw,
			});

			const finalStartupScript = newServer.startupScript ?? "start.sh";

			console.log(
				"Collecting startup script content for",
				finalStartupScript,
			);
			const message = await interaction.editReply({
				components: [buildEditModalContentRow()],
			});
			const collector = message.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 1000 * 60 * 5,
				filter: (i) =>
					i.user.id === interaction.user.id &&
					i.customId === ModalComponentId.EditBtn,
			});
			collector.on("collect", async (i) => {
				const { content, interaction } =
					await collectInputFromModal(
						i,
						await readFile(finalStartupScript, "utf8").catch(
							() => "",
						),
					);
				if (content !== null) {
					const scriptPath = joinPathWithBase(
						newServer.path,
						finalStartupScript,
					);
					console.log(
						"Received startup script content, writing to",
						scriptPath,
					);
					if (!scriptPath) {
						await interaction.editReply({
							content:
								"Failed to determine safe path for custom startup script.",
						});
					} else {
						try {
							await writeFile(scriptPath, content, "utf8");
							await interaction.editReply({
								content: `Startup script ${inlineCode(finalStartupScript)} updated successfully.`,
							});
						} catch {
							await interaction.editReply({
								content: `Failed to write startup script to disk at ${inlineCode(scriptPath)}. Please check file permissions and try again.`,
							});
							return;
						}
					}
					collector.stop();
				}
			});
			collector.on("dispose", () => {
				message
					.edit({
						components: [],
					})
					.catch(() => {
						/* ignore */
					});
			});

			await serverManager.addOrReloadServer(newServer);

			await interaction.editReply({
				content: `✅ Server ${bold(newServer.tag ?? `Server #${newServer.id}`)} (ID: ${bold(String(newServer.id))}) created and loaded successfully.\n${formatServerSummary(newServer)}`,
			});
			return;
		}

		// ─── EDIT / DELETE: resolve target server ─────────────────────────
		const server = await getUserSelectedServer(
			serverManager,
			interaction,
			true,
		);
		if (!server) return;
		const dbServer = await selectServerById(server.id);
		if (!dbServer) {
			return await interaction.editReply({
				content: `Server with ID ${inlineCode(String(server.id))} not found.`,
			});
		}

		// ─── DELETE ───────────────────────────────────────────────────────
		if (sub === "delete") {
			const inMemoryServer = serverManager.getServer(server.id);
			if (
				inMemoryServer &&
				(await inMemoryServer.isOnline.getData(true))
			) {
				return await interaction.editReply({
					content: `Cannot delete ${bold(dbServer.tag ?? `Server #${dbServer.id}`)} while it is online. Stop the server first.`,
				});
			}

			await deleteServer(server.id);
			serverManager.removeServer(server.id);

			return await interaction.editReply({
				content: `🗑️ Server ${bold(dbServer.tag ?? `Server #${dbServer.id}`)} (ID: ${bold(String(server.id))}) has been deleted.`,
			});
		}

		// ─── EDIT ─────────────────────────────────────────────────────────
		if (sub === "edit") {
			const newPath = interaction.options.getString("path");
			const newPluginPath = interaction.options.getString("pluginpath");
			const newVersion = interaction.options.getString("version");
			const newLoaderType = interaction.options.getString("loadertype");
			const newModType = interaction.options.getString("modtype");
			const newTagRaw = interaction.options.getString("tag");
			const newPortRaw = interaction.options.getString("port");
			const newApiPortRaw = interaction.options.getInteger("apiport");
			const newGameType = interaction.options.getString("gametype");
			const newStartupScriptRaw =
				interaction.options.getString("startupscript");

			// Validate at least one field is being changed
			const anyProvided = [
				newPath,
				newPluginPath,
				newVersion,
				newLoaderType,
				newModType,
				newTagRaw,
				newPortRaw,
				newApiPortRaw,
				newGameType,
				newStartupScriptRaw,
			].some((v) => v !== null);

			// Validate port if provided
			let newPorts: number[] | undefined;
			if (newPortRaw !== null) {
				const parsed = parsePorts(newPortRaw);
				if (!parsed) {
					return await interaction.editReply({
						content:
							"Invalid port value(s). Provide a comma-separated list of integers between 1 and 65535.",
					});
				}
				newPorts = parsed;
			}

			// Validate game type if provided
			if (
				newGameType !== null &&
				!serverGameTypes.includes(newGameType as never)
			) {
				return await interaction.editReply({
					content: `Invalid game type. Allowed: ${serverGameTypes.join(", ")}.`,
				});
			}

			// Build the update payload
			// 'null' string is a sentinel to clear optional fields
			const newTag =
				newTagRaw === null
					? undefined // not changing
					: newTagRaw.toLowerCase() === "null"
						? null // clearing
						: newTagRaw;

			const newStartupScript =
				newStartupScriptRaw === null
					? undefined // not changing
					: newStartupScriptRaw.toLowerCase() === "null"
						? null // reset to default
						: newStartupScriptRaw;

			const finalStartupScript =
				(newStartupScript === undefined
					? dbServer.startupScript
					: newStartupScript === null
						? null
						: newStartupScript) ?? "start.sh";

			const newApiPort =
				newApiPortRaw === null
					? undefined // not changing
					: newApiPortRaw === -1
						? null // clearing
						: newApiPortRaw;

			const changing = {
				...(newPath !== null && { path: newPath }),
				...(newPluginPath !== null && { pluginPath: newPluginPath }),
				...(newVersion !== null && { version: newVersion }),
				...(newLoaderType !== null && { loaderType: newLoaderType }),
				...(newModType !== null && { modType: newModType }),
				...(newTag !== undefined && { tag: newTag }),
				...(newPorts !== undefined && { port: newPorts }),
				...(newApiPort !== undefined && { apiPort: newApiPort }),
				...(newGameType !== null && { gameType: newGameType }),
				...(newStartupScript !== undefined && {
					startupScript: newStartupScript,
				}),
			};
			let updatedServer;
			let reloadType = null;
			if (anyProvided) {
				updatedServer = await updateServer(server.id, changing);
				reloadType =
					await serverManager.addOrReloadServer(updatedServer);
			} else {
				updatedServer = dbServer; // no changes, use existing
			}
			//rewrite startup script if requested
			console.log(
				"Collecting startup script content for",
				finalStartupScript,
			);
			const message = await interaction.editReply({
				components: [buildEditModalContentRow()],
			});
			const collector = message.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 1000 * 60 * 5,
				filter: (i) =>
					i.user.id === interaction.user.id &&
					i.customId === ModalComponentId.EditBtn,
			});
			collector.on("collect", async (i) => {
				const { content, interaction } =
					await collectInputFromModal(
						i,
						await readFile(finalStartupScript, "utf8").catch(
							() => "",
						),
					);
				if (content !== null) {
					const scriptPath = joinPathWithBase(
						updatedServer.path,
						finalStartupScript,
					);
					console.log("Resolved script path:", scriptPath);
					if (!scriptPath) {
						await interaction.editReply({
							content:
								"Failed to determine safe path for custom startup script.",
						});
					} else {
						try {
							await writeFile(scriptPath, content, "utf8");
							await interaction.editReply({
								content: `Startup script ${inlineCode(finalStartupScript)} updated successfully.`,
							});
						} catch {
							await interaction.editReply({
								content: `Failed to write startup script to disk at ${inlineCode(scriptPath)}. Please check file permissions and try again.`,
							});
							return;
						}
					}
					collector.stop();
				}
			});
			collector.on("dispose", () => {
				message
					.edit({
						components: [],
					})
					.catch(() => {
						/* ignore */
					});
			});

			const warningLine =
				reloadType === "partial"
					? `\n⚠️ The server is currently ${bold("online")}. Only ${inlineCode("tag")}, ${inlineCode("gametype")}, and ${inlineCode("startupscript")} were updated in memory. All other changes will take effect after the next server restart.`
					: "";

			return await interaction.editReply({
				content: `✅ Server ${bold(updatedServer.tag ?? `Server #${updatedServer.id}`)} (ID: ${bold(String(server.id))}) updated successfully.${warningLine}\n${anyProvided ? formatServerSummary(updatedServer) : "*No update*"}`,
			});
		}

		return await interaction.editReply({ content: "Unknown subcommand." });
	},
	async autoComplete({ interaction, serverManager }) {
		const sub = interaction.options.getSubcommand(true);
		const focused = interaction.options.getFocused(true);

		// gametype autocomplete — available in both create and edit
		if (focused.name === "gametype") {
			const input = focused.value.toLowerCase();
			return interaction.respond(
				serverGameTypes
					.filter((t) => t.includes(input))
					.map((t) => ({ name: t, value: t })),
			);
		}

		// server selection autocomplete — only for edit and delete
		if (focused.name === "server" && (sub === "edit" || sub === "delete")) {
			const input = focused.value.toLowerCase();
			const pairs = serverManager.getAllTagPairs();
			const choices = pairs
				.filter(
					(p) =>
						String(p.id).includes(input) ||
						(p.tag ?? "").toLowerCase().includes(input),
				)
				.slice(0, 25)
				.map((p) => ({
					name: `${p.tag ?? `Server #${p.id}`} (ID: ${p.id})`,
					value: String(p.id),
				}));
			return interaction.respond(choices);
		}

		return interaction.respond([]);
	},
} satisfies CommandFile<false>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePorts(raw: string): number[] | null {
	const parts = raw.split(",").map((p) => parseInt(p.trim()));
	if (parts.some((p) => isNaN(p) || p < 1 || p > 65535)) return null;
	return parts;
}

function formatServerSummary(s: Omit<DbServer, "id" | "tag">): string {
	const joinedPath = joinPathWithBase(s.path, s.startupScript ?? "start.sh");
	const filePreview = joinedPath ? readFileSync(joinedPath, "utf8") : null;
	return [
		`  Path: ${inlineCode(s.path)}`,
		`  Plugins: ${inlineCode(s.pluginPath)}`,
		`  Version: ${inlineCode(s.version)} | Loader: ${inlineCode(s.loaderType)} | Mod: ${inlineCode(s.modType)}`,
		`  Port(s): ${inlineCode(s.port.join(", "))} | API Port: ${s.apiPort != null ? inlineCode(String(s.apiPort)) : italic("none")}`,
		`  Game: ${inlineCode(s.gameType)} | Script: ${s.startupScript ? inlineCode(s.startupScript) : italic("default (./start.sh)")}`,
		`  Script: ${filePreview ? "\n```\n" + filePreview.slice(0, 500) + (filePreview.length > 500 ? "\n…\n```" : "\n```") : italic("No startup script found or file is empty.")}`,
	].join("\n");
}
