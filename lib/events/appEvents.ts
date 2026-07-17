import type { ChatInputCommandInteraction, Client } from "discord.js";
import type { PartialTransaction, SpendCreditParams } from "../credit";
import type {
	createServer,
	DbServer,
	IdentityLinkRecord,
	ServerArtifactRecord,
	updateServer,
} from "../db";
import type { readPermission } from "../permission";
import type { Server, ServerManager } from "../server";
import type { GlobalSettings, ServerSettings } from "../settings";
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

/** Fired when the set of online servers transitions between "none" and "some". */
export interface ServerStatusChangedPayload {
	/** True when at least one managed server is currently online. */
	anyOnline: boolean;
}

export type AppEventMap = {
	/** Emitted after any slash command starts executing. */
	commandCalled: CommandCalledPayload;
	/** Emitted whenever global settings change. */
	settingsChanged: SettingsChangedPayload;
	/** Emitted whenever a user's credit balance changes. */
	creditChanged: CreditChangedPayload;
	/** Emitted when the "any server online" state flips (plugins may open/close
	 *  their own callback servers in response). */
	serverStatusChanged: ServerStatusChangedPayload;
};

// ─── Request/response (data access) channels ──────────────────────────────────

export type { ServerArtifactRecord, IdentityLinkRecord };

export interface TrackArtifactParams {
	provider: string;
	artifactId: string;
	versionId: string;
	serverId: number;
	filePath: string;
	metadata?: Record<string, unknown>;
}

export interface LinkIdentityParams {
	pluginId: string;
	externalId: string;
	discordId: string;
	serverId?: number;
	metadata?: Record<string, unknown>;
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
	/** All managed artifacts for a server, optionally filtered by provider. */
	"artifact:list": {
		params: { serverId: number; provider?: string };
		result: ServerArtifactRecord[];
	};
	/** Create or update a managed artifact record. */
	"artifact:track": {
		params: TrackArtifactParams;
		result: ServerArtifactRecord;
	};
	/** Delete a managed artifact record; null when it did not exist. */
	"artifact:delete": {
		params: {
			provider: string;
			artifactId: string;
			versionId: string;
			serverId: number;
		};
		result: ServerArtifactRecord | null;
	};
	/** Look up one identity link by its external id. */
	"identity:getByExternal": {
		params: { pluginId: string; externalId: string };
		result: IdentityLinkRecord | null;
	};
	/** All identity links a Discord user holds for a plugin. */
	"identity:getByDiscord": {
		params: { pluginId: string; discordId: string };
		result: IdentityLinkRecord[];
	};
	/** Create an identity link. */
	"identity:link": {
		params: LinkIdentityParams;
		result: IdentityLinkRecord;
	};
	/** Remove an identity link; false when it did not exist. */
	"identity:unlink": {
		params: { pluginId: string; externalId: string };
		result: boolean;
	};
	/** Update an identity link's metadata; null when it did not exist. */
	"identity:updateMetadata": {
		params: {
			pluginId: string;
			externalId: string;
			metadata: Record<string, unknown>;
		};
		result: IdentityLinkRecord | null;
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
	/** A generic runtime snapshot of the online server bound to a port, or null.
	 *  Used by game plugins that expose an inbound callback server. */
	"server:getActiveByPort": {
		params: { port: number };
		result: {
			id: number;
			pluginId: string;
			tag: string | null;
			config: Record<string, unknown>;
			settings: ServerSettings;
		} | null;
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
	/** Read a value from a plugin's namespaced state store. */
	"store:get": {
		params: { namespace: string; key: string };
		result: unknown;
	};
	/** Read all values in a plugin's namespaced state store. */
	"store:getAll": {
		params: { namespace: string };
		result: Record<string, unknown>;
	};
	/** Write a value to a plugin's namespaced state store. */
	"store:set": {
		params: { namespace: string; key: string; value: unknown };
		result: void;
	};
	/** Delete a value from a plugin's namespaced state store. */
	"store:delete": {
		params: { namespace: string; key: string };
		result: void;
	};
};

/**
 * Global singleton event bus.
 *
 * Core code may emit events and register data handlers directly on this bus.
 * Plugins must NOT import this module — they get a restricted view through
 * `plugins/api.ts` (subscribe + request only).
 */
export const appEvents = new EventBus<AppEventMap, AppRequestMap>();
