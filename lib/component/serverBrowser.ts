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
import { getAllGamePlugins } from "../plugin/registry";
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
	PLUGIN_ID = "sb_pluginid",
	RUNTIME_VERSION = "sb_runtimeversion",
	PATH = "sb_path",
	PORT = "sb_port",
	CONFIG = "sb_config",
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

/** Pretty-print a server's opaque plugin config JSON for display/editing. */
export function stringifyConfig(config: unknown): string {
	try {
		return JSON.stringify(config ?? {}, null, 2);
	} catch {
		return "{}";
	}
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
				name: "Game Plugin",
				value: inlineCode(server.pluginId),
				inline: true,
			},
			{
				name: "Runtime Version",
				value: server.runtimeVersion
					? inlineCode(server.runtimeVersion)
					: italic("none"),
				inline: true,
			},
			{
				name: "Port(s)",
				value: inlineCode(server.port.join(", ") || "none"),
				inline: true,
			},
			{
				name: "Plugin Config",
				value: inlineCode(
					stringifyConfig(server.config).slice(0, 1000) || "{}",
				),
				inline: false,
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
 * Modal for editing generic identity: tag, game plugin id, runtime version.
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

	const pluginInput = new TextInputBuilder()
		.setCustomId(ServerBrowserInputId.PLUGIN_ID)
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setValue(server.pluginId);

	const runtimeInput = new TextInputBuilder()
		.setCustomId(ServerBrowserInputId.RUNTIME_VERSION)
		.setStyle(TextInputStyle.Short)
		.setRequired(false);
	if (server.runtimeVersion) runtimeInput.setValue(server.runtimeVersion);

	const knownGames = getAllGamePlugins()
		.map((p) => p.id)
		.join(" | ");

	modal.addLabelComponents(
		new LabelBuilder()
			.setLabel("Tag")
			.setDescription("Leave empty to clear the display tag")
			.setTextInputComponent(tagInput),
		new LabelBuilder()
			.setLabel("Game Plugin")
			.setDescription(knownGames || "e.g. minecraft")
			.setTextInputComponent(pluginInput),
		new LabelBuilder()
			.setLabel("Runtime Version")
			.setDescription("Optional generic version label")
			.setTextInputComponent(runtimeInput),
	);

	return modal;
}

/**
 * Modal for editing path, port, and the plugin config JSON.
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

	const portInput = new TextInputBuilder()
		.setCustomId(ServerBrowserInputId.PORT)
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setValue(server.port.join(", "));

	const configInput = new TextInputBuilder()
		.setCustomId(ServerBrowserInputId.CONFIG)
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(false)
		.setValue(stringifyConfig(server.config));

	modal.addLabelComponents(
		new LabelBuilder()
			.setLabel("Server Directory Path")
			.setTextInputComponent(pathInput),
		new LabelBuilder()
			.setLabel("Port(s)")
			.setDescription("Comma-separated integers between 1–65535")
			.setTextInputComponent(portInput),
		new LabelBuilder()
			.setLabel("Plugin Config (JSON)")
			.setDescription("Game-specific configuration, validated on load")
			.setTextInputComponent(configInput),
	);

	return modal;
}