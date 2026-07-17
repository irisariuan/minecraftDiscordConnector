import { spendCredit } from "../credit";
import {
	createServer,
	deletePluginRecord,
	getAllServers,
	getPluginsByServerId,
	selectServerById,
	updateServer,
	upsertNewPlugin,
} from "../db";
import { CF_KEY, UPDATE_URL } from "../env";
import { readPermission } from "../permission";
import { settings } from "../settings";
import { appEvents, type PluginEnvKey } from "./appEvents";

/**
 * Registers the core-side handlers backing every data-access channel exposed
 * to plugins. Must be called once at startup, before any plugin code runs.
 */
export function registerCoreDataHandlers() {
	appEvents.handle("db:getPluginsByServerId", ({ serverId }) =>
		getPluginsByServerId(serverId),
	);

	appEvents.handle(
		"db:trackPlugin",
		({ projectId, versionId, serverId, filePath }) =>
			upsertNewPlugin({
				create: { projectId, versionId, serverId, filePath },
				update: { filePath, versionId },
				where: {
					projectId_versionId_serverId: {
						projectId,
						versionId,
						serverId,
					},
				},
			}),
	);

	appEvents.handle(
		"db:deletePluginRecord",
		({ projectId, versionId, serverId }) =>
			deletePluginRecord(projectId, versionId, serverId),
	);

	appEvents.handle("db:getAllServers", () => getAllServers());
	appEvents.handle("db:getServerById", ({ id }) => selectServerById(id));
	appEvents.handle("db:createServer", (data) => createServer(data));
	appEvents.handle("db:updateServer", ({ id, data }) =>
		updateServer(id, data),
	);

	appEvents.handle("permission:read", ({ user, serverId }) =>
		readPermission(user, serverId),
	);

	// `settings` is a live binding — reading it here always returns the
	// current value even after changeSettings() reassigns it.
	appEvents.handle("settings:get", () => settings);

	appEvents.handle("credit:spend", (params) => spendCredit(params));

	const pluginEnv: Record<PluginEnvKey, string | undefined> = {
		CF_KEY,
		UPDATE_URL,
	};
	appEvents.handle("env:get", ({ key }) => pluginEnv[key]);
}
