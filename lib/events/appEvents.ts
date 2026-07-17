import type { ChatInputCommandInteraction, Client } from "discord.js";
import type { PartialTransaction, SpendCreditParams } from "../credit";
import type {
	createServer,
	DbServer,
	getPluginsByServerId,
	updateServer,
} from "../db";
import type { readPermission } from "../permission";
import type { Server, ServerManager } from "../server";
import type { GlobalSettings } from "../settings";
import { EventBus } from "./bus";

// ─── Broadcast event payloads ─────────────────────────────────────────────────

/**
 * Fired after a slash command's `execute()` function is invoked.
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

/** Fired after global settings are changed via {@link setSettings}. */
export interface SettingsChangedPayload {
	/** The keys that were changed and their new values. */
	changes: Partial<GlobalSettings>;
	/** The full settings object after the change. */
	settings: GlobalSettings;
}

/** Fired after a user's credit balance changes. */
export interface CreditChangedPayload {
	userId: string;
	/** Credit delta that was applied (negative for deductions). */
	change: number;
	/** Balance after the change. */
	newCredit: number;
	reason: string;
	serverId?: number;
}

// ─── Broadcast event map ──────────────────────────────────────────────────────

export type AppEventMap = {
	/** Emitted after any slash command starts executing. */
	commandCalled: CommandCalledPayload;
	/** Emitted whenever global settings change. */
	settingsChanged: SettingsChangedPayload;
	/** Emitted whenever a user's credit balance changes. */
	creditChanged: CreditChangedPayload;
};

// ─── Request/response (data access) channels ──────────────────────────────────

/** A plugin record as stored in the database. */
export type TrackedPlugin = Awaited<
	ReturnType<typeof getPluginsByServerId>
>[number];

export interface TrackPluginParams {
	projectId: string;
	versionId: string;
	serverId: number;
	filePath: string;
}

/** Environment variables the core is willing to expose to plugins. */
export type PluginEnvKey = "CF_KEY" | "UPDATE_URL";

/** Input data for creating a server record. */
export type ServerCreateData = Parameters<typeof createServer>[0];
/** Input data for updating a server record. */
export type ServerUpdateData = Parameters<typeof updateServer>[1];
/** Resolved permission value of a user. */
export type PermissionValue = Awaited<ReturnType<typeof readPermission>>;

export type { DbServer };

export type AppRequestMap = {
	/** All tracked plugin records for a server. */
	"db:getPluginsByServerId": {
		params: { serverId: number };
		result: TrackedPlugin[];
	};
	/** Create or update a tracked plugin record. */
	"db:trackPlugin": { params: TrackPluginParams; result: TrackedPlugin };
	/** Delete a tracked plugin record; null when it did not exist. */
	"db:deletePluginRecord": {
		params: { projectId: string; versionId: string; serverId: number };
		result: TrackedPlugin | null;
	};
	/** All server records. */
	"db:getAllServers": { params: undefined; result: DbServer[] };
	/** A single server record by id, or null. */
	"db:getServerById": { params: { id: number }; result: DbServer | null };
	/** Create a new server record. */
	"db:createServer": { params: ServerCreateData; result: DbServer };
	/** Update an existing server record. */
	"db:updateServer": {
		params: { id: number; data: ServerUpdateData };
		result: DbServer;
	};
	/** Resolve a user's (optionally server-scoped) permission value. */
	"permission:read": {
		params: { user: string | { id: string }; serverId?: number };
		result: PermissionValue;
	};
	/** Snapshot of the current global settings. */
	"settings:get": { params: undefined; result: GlobalSettings };
	/** Charge a user credits (full spendCredit flow incl. ticket selection). */
	"credit:spend": {
		params: SpendCreditParams;
		result: PartialTransaction | null;
	};
	/** Read a whitelisted environment variable. */
	"env:get": { params: { key: PluginEnvKey }; result: string | undefined };
};

/**
 * Global singleton event bus.
 *
 * Core code may emit events and register data handlers directly on this bus.
 * Plugins must NOT import this module — they get a restricted view through
 * `plugins/api.ts` (subscribe + request only).
 */
export const appEvents = new EventBus<AppEventMap, AppRequestMap>();
