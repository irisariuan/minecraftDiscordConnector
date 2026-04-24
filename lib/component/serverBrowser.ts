import {
	ActionRowBuilder,
	bold,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	inlineCode,
	italic,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ChatInputCommandInteraction,
	LabelBuilder,
} from "discord.js";
import {
	deleteServer,
	getAllServers,
	updateServer,
	type DbServer,
} from "../db";
import type { ServerManager } from "../server";
import { serverGameTypes } from "../server";
import { collectInputFromModal } from "./modal";
import { joinPathWithBase } from "../utils";
import { readFile, writeFile } from "node:fs/promises";

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum ServerBrowserAction {
	PREV = "sb_prev",
	NEXT = "sb_next",
	EDIT_INFO = "sb_edit_info",
	EDIT_PATHS = "sb_edit_paths",
	EDIT_SCRIPT = "sb_edit_script",
	DELETE = "sb_delete",
	CONFIRM_DELETE = "sb_confirm_delete",
	CANCEL_DELETE = "sb_cancel_delete",
}

export enum ServerBrowserModalId {
	EDIT_INFO = "sb_modal_info",
	EDIT_PATHS = "sb_modal_paths",
}

export enum ServerBrowserInputId {
	TAG = "sb_tag",
	VERSION = "sb_version",
	LOADER_TYPE = "sb_loadertype",
	MOD_TYPE = "sb_modtype",
	GAME_TYPE = "sb_gametype",
	PATH = "sb_path",
	PLUGIN_PATH = "sb_pluginpath",
	PORT = "sb_port",
	API_PORT = "sb_apiport",
}

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

// ─── Embed ────────────────────────────────────────────────────────────────────

/**
 * Build a server-detail embed.
 *
 * Pass `serverManager: null` to render a blue "Preview (not yet created)"
 * badge — used when reviewing a server before it is written to the database.
 */
export function buildServerEmbed(
	server: DbServer,
	serverManager: ServerManager | null,
	index: number,
	total: number,
): EmbedBuilder {
	const inMemory = serverManager?.getServer(server.id);
	const statusLabel =
		serverManager === null
			? "🔵 Preview (not yet created)"
			: inMemory
				? "🟢 Loaded"
				: "⚫ Not Loaded";

	return new EmbedBuilder()
		.setTitle(
			server.id === 0
				? `[Preview] ${server.tag ?? "New Server"}`
				: `[${server.id}] ${server.tag ?? `Server #${server.id}`}`,
		)
		.setColor(serverManager === null ? "Blue" : inMemory ? "Green" : "Grey")
		.setDescription(statusLabel)
		.addFields(
			{ name: "Path", value: inlineCode(server.path), inline: false },
			{
				name: "Plugin Path",
				value: inlineCode(server.pluginPath),
				inline: false,
			},
			{
				name: "Version",
				value: inlineCode(server.version),
				inline: true,
			},
			{
				name: "Loader",
				value: inlineCode(server.loaderType),
				inline: true,
			},
			{
				name: "Mod Type",
				value: inlineCode(server.modType),
				inline: true,
			},
			{
				name: "Port(s)",
				value: inlineCode(server.port.join(", ")),
				inline: true,
			},
			{
				name: "API Port",
				value:
					server.apiPort != null
						? inlineCode(String(server.apiPort))
						: italic("none"),
				inline: true,
			},
			{
				name: "Game Type",
				value: inlineCode(server.gameType),
				inline: true,
			},
			{
				name: "Startup Script",
				value: server.startupScript
					? inlineCode(server.startupScript)
					: italic("default (./start.sh)"),
				inline: false,
			},
		)
		.setFooter({ text: `Server ${index + 1} of ${total}` });
}

// ─── Component Rows ───────────────────────────────────────────────────────────

export function buildNavigationRow(
	index: number,
	total: number,
): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(ServerBrowserAction.PREV)
			.setLabel("◀ Prev")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(index <= 0),
		new ButtonBuilder()
			.setCustomId("sb_counter")
			.setLabel(`${index + 1} / ${total}`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
		new ButtonBuilder()
			.setCustomId(ServerBrowserAction.NEXT)
			.setLabel("Next ▶")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(index >= total - 1),
	);
}

export function buildActionRow(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(ServerBrowserAction.EDIT_INFO)
			.setLabel("Edit Info")
			.setStyle(ButtonStyle.Primary)
			.setEmoji("✏️"),
		new ButtonBuilder()
			.setCustomId(ServerBrowserAction.EDIT_PATHS)
			.setLabel("Edit Paths")
			.setStyle(ButtonStyle.Primary)
			.setEmoji("📁"),
		new ButtonBuilder()
			.setCustomId(ServerBrowserAction.EDIT_SCRIPT)
			.setLabel("Edit Script")
			.setStyle(ButtonStyle.Secondary)
			.setEmoji("📜"),
		new ButtonBuilder()
			.setCustomId(ServerBrowserAction.DELETE)
			.setLabel("Delete")
			.setStyle(ButtonStyle.Danger)
			.setEmoji("🗑️"),
	);
}

export function buildConfirmDeleteRow(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(ServerBrowserAction.CONFIRM_DELETE)
			.setLabel("Confirm Delete")
			.setStyle(ButtonStyle.Danger)
			.setEmoji("🗑️"),
		new ButtonBuilder()
			.setCustomId(ServerBrowserAction.CANCEL_DELETE)
			.setLabel("Cancel")
			.setStyle(ButtonStyle.Secondary),
	);
}

// ─── Modals ───────────────────────────────────────────────────────────────────

/**
 * Modal for editing tag, version, loaderType, modType, gameType (max 5 inputs).
 */
export function buildEditInfoModal(server: DbServer): ModalBuilder {
	const modal = new ModalBuilder()
		.setCustomId(ServerBrowserModalId.EDIT_INFO)
		.setTitle(
			`Edit Info — ${(server.tag ?? `Server #${server.id}`).slice(0, 30)}`,
		);

	const tagInput = new TextInputBuilder()
		.setCustomId(ServerBrowserInputId.TAG)
		.setStyle(TextInputStyle.Short)
		.setRequired(false)
		.setMaxLength(100);
	if (server.tag) tagInput.setValue(server.tag);

	const versionInput = new TextInputBuilder()
		.setCustomId(ServerBrowserInputId.VERSION)
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setValue(server.version);

	const loaderInput = new TextInputBuilder()
		.setCustomId(ServerBrowserInputId.LOADER_TYPE)
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setValue(server.loaderType);

	const modInput = new TextInputBuilder()
		.setCustomId(ServerBrowserInputId.MOD_TYPE)
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setValue(server.modType);

	const gameInput = new TextInputBuilder()
		.setCustomId(ServerBrowserInputId.GAME_TYPE)
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setPlaceholder(serverGameTypes.join(" | "))
		.setValue(server.gameType);

	modal.addLabelComponents(
		new LabelBuilder()
			.setLabel("Tag")
			.setDescription("Leave empty to clear the display tag")
			.setTextInputComponent(tagInput),
		new LabelBuilder()
			.setLabel("Version")
			.setDescription("e.g. 1.21.1")
			.setTextInputComponent(versionInput),
		new LabelBuilder()
			.setLabel("Loader Type")
			.setDescription("e.g. paper, fabric, forge")
			.setTextInputComponent(loaderInput),
		new LabelBuilder()
			.setLabel("Mod Type")
			.setDescription("e.g. plugin, mod, none")
			.setTextInputComponent(modInput),
		new LabelBuilder()
			.setLabel("Game Type")
			.setDescription(serverGameTypes.join(" | "))
			.setTextInputComponent(gameInput),
	);

	return modal;
}

/**
 * Modal for editing path, pluginPath, port, apiPort.
 */
export function buildEditPathsModal(server: DbServer): ModalBuilder {
	const modal = new ModalBuilder()
		.setCustomId(ServerBrowserModalId.EDIT_PATHS)
		.setTitle(
			`Edit Paths — ${(server.tag ?? `Server #${server.id}`).slice(0, 27)}`,
		);

	const pathInput = new TextInputBuilder()
		.setCustomId(ServerBrowserInputId.PATH)
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setValue(server.path);

	const pluginPathInput = new TextInputBuilder()
		.setCustomId(ServerBrowserInputId.PLUGIN_PATH)
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setValue(server.pluginPath);

	const portInput = new TextInputBuilder()
		.setCustomId(ServerBrowserInputId.PORT)
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setValue(server.port.join(", "));

	const apiPortInput = new TextInputBuilder()
		.setCustomId(ServerBrowserInputId.API_PORT)
		.setStyle(TextInputStyle.Short)
		.setRequired(false)
		.setPlaceholder("e.g. 8080");
	if (server.apiPort != null) apiPortInput.setValue(String(server.apiPort));

	modal.addLabelComponents(
		new LabelBuilder()
			.setLabel("Server Directory Path")
			.setTextInputComponent(pathInput),
		new LabelBuilder()
			.setLabel("Plugin Directory Path")
			.setTextInputComponent(pluginPathInput),
		new LabelBuilder()
			.setLabel("Port(s)")
			.setDescription("Comma-separated integers between 1–65535")
			.setTextInputComponent(portInput),
		new LabelBuilder()
			.setLabel("API Port")
			.setDescription("Leave empty or enter -1 to clear")
			.setTextInputComponent(apiPortInput),
	);

	return modal;
}