import { EventEmitter } from "node:events";
import type { ChatInputCommandInteraction, Client } from "discord.js";
import type { Server, ServerManager } from "./server";

// ─── Event payloads ───────────────────────────────────────────────────────────

/**
 * Fired after a slash command's `execute()` function resolves.
 * `server` is `null` for commands that set `requireServer: false`.
 */
export interface CommandCalledPayload {
	commandName: string;
	interaction: ChatInputCommandInteraction;
	/** null when the command does not require a server */
	server: Server | null;
	client: Client;
	serverManager: ServerManager;
}

// ─── Event map ────────────────────────────────────────────────────────────────

export interface PluginEventMap {
	/**
	 * Emitted after any slash command finishes executing.
	 * Listen to this in plugin scripts to react to specific commands.
	 */
	commandCalled: CommandCalledPayload;
}

// ─── Typed wrapper around Node EventEmitter ───────────────────────────────────

class PluginEventEmitter {
	private readonly _emitter = new EventEmitter();

	emit<K extends keyof PluginEventMap>(
		event: K,
		payload: PluginEventMap[K],
	): void {
		this._emitter.emit(event, payload);
	}

	on<K extends keyof PluginEventMap>(
		event: K,
		listener: (payload: PluginEventMap[K]) => void,
	): this {
		this._emitter.on(event, listener);
		return this;
	}

	once<K extends keyof PluginEventMap>(
		event: K,
		listener: (payload: PluginEventMap[K]) => void,
	): this {
		this._emitter.once(event, listener);
		return this;
	}

	off<K extends keyof PluginEventMap>(
		event: K,
		listener: (payload: PluginEventMap[K]) => void,
	): this {
		this._emitter.off(event, listener);
		return this;
	}
}

/**
 * Global singleton event bus for the plugin system.
 *
 * @example
 * ```ts
 * // In a plugin script:
 * import { pluginEvents } from "../../lib/pluginEvent";
 *
 * export default function run() {
 *   pluginEvents.on("commandCalled", ({ commandName, server }) => {
 *     if (commandName !== "mycommand") return;
 *     // do something...
 *   });
 * }
 * ```
 */
export const pluginEvents = new PluginEventEmitter();
