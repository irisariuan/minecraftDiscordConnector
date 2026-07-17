/**
 * Plugin API — the ONLY module plugin code may import from outside its own
 * plugin folder. Do not import from `lib/**` directly in plugins.
 *
 * It exposes a restricted view of the app-wide event bus:
 * - `events` — subscribe to broadcast events (`on` / `once` / `off`).
 *   Plugins cannot emit core events.
 * - `data` — typed request/response channels for data access
 *   (database, settings, credit, whitelisted env vars).
 *   Plugins cannot register handlers.
 *
 * Plus re-exports of pure helpers and types that carry no data access.
 *
 * @example
 * ```ts
 * import { events, data } from "../api";
 *
 * export default function run() {
 *   events.on("commandCalled", async ({ commandName, server }) => {
 *     if (commandName !== "startserver" || !server) return;
 *     const plugins = await data.request("db:getPluginsByServerId", {
 *       serverId: server.id,
 *     });
 *     // ...
 *   });
 * }
 * ```
 */
import {
	appEvents,
	type AppEventMap,
	type AppRequestMap,
} from "../lib/events/appEvents";

/** Subscribe to broadcast events emitted by the core. */
export const events = {
	on<K extends keyof AppEventMap & string>(
		event: K,
		listener: (payload: AppEventMap[K]) => void,
	) {
		appEvents.on(event, listener);
	},
	once<K extends keyof AppEventMap & string>(
		event: K,
		listener: (payload: AppEventMap[K]) => void,
	) {
		appEvents.once(event, listener);
	},
	off<K extends keyof AppEventMap & string>(
		event: K,
		listener: (payload: AppEventMap[K]) => void,
	) {
		appEvents.off(event, listener);
	},
};

/** Request data from the core through typed channels. */
export const data = {
	request<K extends keyof AppRequestMap & string>(
		channel: K,
		...args: AppRequestMap[K]["params"] extends undefined
			? []
			: [AppRequestMap[K]["params"]]
	): Promise<AppRequestMap[K]["result"]> {
		return appEvents.request(channel, ...args);
	},
};

// ─── Types safe for plugin use (erased at runtime) ────────────────────────────

export type {
	AppEventMap,
	AppRequestMap,
	CommandCalledPayload,
	CreditChangedPayload,
	DbServer,
	PermissionValue,
	PluginEnvKey,
	ServerCreateData,
	ServerUpdateData,
	SettingsChangedPayload,
	TrackedPlugin,
	TrackPluginParams,
} from "../lib/events/appEvents";
export type { CommandFile, ExecuteParams } from "../lib/commandFile";
export type {
	PartialTransaction,
	SpendCreditParams,
	Transaction,
	UserCredit,
} from "../lib/credit";
export type { Permission } from "../lib/permission";
export type { Server, ServerGameType, ServerManager } from "../lib/server";
export type { GlobalSettings, ServerSettings } from "../lib/settings";

// ─── Pure helpers & UI components (no data access) ────────────────────────────

export {
	runPhasedInput,
	type PhasedPhase,
	type PhasedValues,
} from "../lib/component/phasedInput";
export {
	createRequestComponent,
	RequestComponentId,
} from "../lib/component/request";
export { sendPaginationMessage } from "../lib/pagination";
export {
	compareAllPermissions,
	comparePermission,
	orPerm,
	PermissionFlags,
} from "../lib/permission";
export {
	findHighestAvailableVersion,
	getPaperProject,
	getPaperVersionBuild,
} from "../lib/serverInstance/jar";
export {
	createPathForPluginFile,
	getActivePlugins,
} from "../lib/serverInstance/plugin";
export {
	fetchVersionOptionsForLoader,
	KNOWN_LOADERS,
} from "../lib/serverLoader";
export {
	ensureSuffix,
	formatFileSize,
	getNextTimestamp,
	removeSuffix,
	safeFetch,
	safeJoin,
	separate,
	trimTextWithSuffix,
} from "../lib/utils";
export { downloadAndSave } from "../lib/utils/web";
