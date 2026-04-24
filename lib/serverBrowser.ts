import {
	ChatInputCommandInteraction,
	ComponentType,
	inlineCode,
	bold,
	MessageFlags,
} from "discord.js";
import { readFile, writeFile } from "node:fs/promises";
import { collectInputFromModal } from "./component/modal";
import {
	ServerBrowserAction,
	ServerBrowserModalId,
	ServerBrowserInputId,
	buildActionRow,
	buildEditInfoModal,
	buildEditPathsModal,
	buildNavigationRow,
	buildServerEmbed,
	buildConfirmDeleteRow,
} from "./component/serverBrowser";
import { getAllServers, updateServer, deleteServer } from "./db";
import { ServerManager, serverGameTypes } from "./server";
import { joinPathWithBase } from "./utils";

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Parse a comma-separated port string into an array of valid port numbers.
 * Returns null if any value is out of range or not a number.
 */
export function parsePorts(raw: string): number[] | null {
	const parts = raw.split(",").map((p) => parseInt(p.trim(), 10));
	if (parts.some((p) => isNaN(p) || p < 1 || p > 65535)) return null;
	return parts;
}

// ─── Main Function ────────────────────────────────────────────────────────────

/**
 * Sends an interactive server browser to the given (already-deferred) interaction.
 *
 * Displays the server details embed with:
 *  - Row 1: ◀ Prev | [N / Total] | Next ▶  (navigation)
 *  - Row 2: ✏️ Edit Info | 📁 Edit Paths | 📜 Edit Script | 🗑️ Delete  (toolbox)
 *
 * Handles pagination between servers, modal-based editing, and delete
 * confirmation entirely within this collector loop.
 */
export async function sendServerBrowser(
	interaction: ChatInputCommandInteraction,
	serverManager: ServerManager,
): Promise<void> {
	let servers = await getAllServers();

	if (servers.length === 0) {
		await interaction.editReply({
			content: "No servers found in the database.",
		});
		return;
	}

	let index = 0;

	/** Re-render the browser message for the server at the current index. */
	const render = async (statusMessage = "") => {
		const server = servers[index]!;
		return interaction.editReply({
			content: statusMessage,
			embeds: [
				buildServerEmbed(server, serverManager, index, servers.length),
			],
			components: [
				buildNavigationRow(index, servers.length),
				buildActionRow(),
			],
		});
	};

	const message = await render();

	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.Button,
		filter: (i) => i.user.id === interaction.user.id,
		time: 1000 * 60 * 15,
	});

	collector.on("collect", async (i) => {
		const server = servers[index];
		if (!server) return;

		switch (i.customId) {
			// ── Navigation ───────────────────────────────────────────────
			case ServerBrowserAction.PREV: {
				await i.deferUpdate();
				index = Math.max(0, index - 1);
				await render();
				break;
			}

			case ServerBrowserAction.NEXT: {
				await i.deferUpdate();
				index = Math.min(servers.length - 1, index + 1);
				await render();
				break;
			}

			// ── Edit Info ─────────────────────────────────────────────────
			case ServerBrowserAction.EDIT_INFO: {
				await i.showModal(buildEditInfoModal(server));

				const submit = await i
					.awaitModalSubmit({
						time: 1000 * 60 * 5,
						filter: (mi) =>
							mi.user.id === i.user.id &&
							mi.customId === ServerBrowserModalId.EDIT_INFO,
					})
					.catch(() => null);

				if (!submit) return;
				await submit.deferUpdate();

				const tagRaw = submit.fields
					.getTextInputValue(ServerBrowserInputId.TAG)
					.trim();
				const newTag = tagRaw === "" ? null : tagRaw;
				const newVersion = submit.fields
					.getTextInputValue(ServerBrowserInputId.VERSION)
					.trim();
				const newLoaderType = submit.fields
					.getTextInputValue(ServerBrowserInputId.LOADER_TYPE)
					.trim();
				const newModType = submit.fields
					.getTextInputValue(ServerBrowserInputId.MOD_TYPE)
					.trim();
				const newGameType = submit.fields
					.getTextInputValue(ServerBrowserInputId.GAME_TYPE)
					.trim();

				if (!serverGameTypes.includes(newGameType as never)) {
					await interaction.editReply({
						content: `❌ Invalid game type ${inlineCode(newGameType)}. Allowed: ${serverGameTypes.join(", ")}.`,
						embeds: [],
						components: [],
					});
					return;
				}

				const updatedServer = await updateServer(server.id, {
					tag: newTag,
					version: newVersion,
					loaderType: newLoaderType,
					modType: newModType,
					gameType: newGameType,
				});

				await serverManager.addOrReloadServer(updatedServer);
				servers = await getAllServers();
				await render();
				break;
			}

			// ── Edit Paths ────────────────────────────────────────────────
			case ServerBrowserAction.EDIT_PATHS: {
				await i.showModal(buildEditPathsModal(server));

				const submit = await i
					.awaitModalSubmit({
						time: 1000 * 60 * 5,
						filter: (mi) =>
							mi.user.id === i.user.id &&
							mi.customId === ServerBrowserModalId.EDIT_PATHS,
					})
					.catch(() => null);

				if (!submit) return;
				await submit.deferUpdate();

				const newPath = submit.fields
					.getTextInputValue(ServerBrowserInputId.PATH)
					.trim();
				const newPluginPath = submit.fields
					.getTextInputValue(ServerBrowserInputId.PLUGIN_PATH)
					.trim();
				const portRaw = submit.fields
					.getTextInputValue(ServerBrowserInputId.PORT)
					.trim();
				const apiPortRaw = submit.fields
					.getTextInputValue(ServerBrowserInputId.API_PORT)
					.trim();

				const newPorts = parsePorts(portRaw);
				if (!newPorts) {
					await interaction.editReply({
						content:
							"❌ Invalid port value(s). Provide a comma-separated list of integers between 1 and 65535.",
						embeds: [],
						components: [],
					});
					return;
				}

				const apiPortNum =
					apiPortRaw === "" || apiPortRaw === "-1"
						? null
						: parseInt(apiPortRaw, 10);
				if (
					apiPortRaw !== "" &&
					apiPortRaw !== "-1" &&
					isNaN(apiPortNum as number)
				) {
					await interaction.editReply({
						content: "❌ Invalid API port value.",
						embeds: [],
						components: [],
					});
					return;
				}

				const updatedServer = await updateServer(server.id, {
					path: newPath,
					pluginPath: newPluginPath,
					port: newPorts,
					apiPort: apiPortNum,
				});

				await serverManager.addOrReloadServer(updatedServer);
				servers = await getAllServers();
				await render();
				break;
			}

			// ── Edit Script ───────────────────────────────────────────────
			case ServerBrowserAction.EDIT_SCRIPT: {
				const finalStartupScript = server.startupScript ?? "start.sh";
				const scriptPath = joinPathWithBase(
					server.path,
					finalStartupScript,
				);
				const currentContent = scriptPath
					? await readFile(scriptPath, "utf8").catch(() => "")
					: "";

				const { content, interaction: modalInteraction } =
					await collectInputFromModal(i, currentContent);

				if (content === null || modalInteraction === null) return;

				if (!scriptPath) {
					await modalInteraction.editReply({
						content:
							"❌ Failed to determine safe path for custom startup script.",
					});
					return;
				}

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
				break;
			}

			// ── Delete (with confirmation) ────────────────────────────────
			case ServerBrowserAction.DELETE: {
				const inMemoryServer = serverManager.getServer(server.id);
				if (
					inMemoryServer &&
					(await inMemoryServer.isOnline.getData(true))
				) {
					await i.reply({
						content: `❌ Cannot delete ${bold(server.tag ?? `Server #${server.id}`)} while it is online. Stop the server first.`,
						flags: MessageFlags.Ephemeral,
					});
					return;
				}

				await i.update({
					content: `⚠️ Are you sure you want to delete ${bold(server.tag ?? `Server #${server.id}`)}? This cannot be undone.`,
					embeds: [
						buildServerEmbed(
							server,
							serverManager,
							index,
							servers.length,
						),
					],
					components: [buildConfirmDeleteRow()],
				});
				break;
			}

			case ServerBrowserAction.CONFIRM_DELETE: {
				await i.deferUpdate();
				const deleted = servers[index]!;

				await deleteServer(deleted.id);
				serverManager.removeServer(deleted.id);
				servers = await getAllServers();

				if (servers.length === 0) {
					await interaction.editReply({
						content: `🗑️ Server ${bold(deleted.tag ?? `Server #${deleted.id}`)} deleted. No more servers in the database.`,
						embeds: [],
						components: [],
					});
					collector.stop();
					return;
				}

				index = Math.min(index, servers.length - 1);
				await render(
					`🗑️ Deleted ${bold(deleted.tag ?? `Server #${deleted.id}`)}.`,
				);
				break;
			}

			case ServerBrowserAction.CANCEL_DELETE: {
				await i.deferUpdate();
				await render();
				break;
			}
		}
	});

	collector.on("end", () => {
		interaction.editReply({ components: [] }).catch(() => {});
	});
}
