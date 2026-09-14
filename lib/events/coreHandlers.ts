import { canSpendCredit, refundCredit, spendCredit } from "../credit";
import {
	createIdentityLink,
	createServer,
	deleteIdentityLink,
	deleteServerArtifactByPath,
	deleteServerArtifactRecord,
	getAllServers,
	getIdentitiesByDiscordId,
	getIdentityByExternalId,
	getServerArtifactsByServerId,
	selectServerById,
	updateIdentityMetadata,
	updateServer,
	upsertServerArtifact,
} from "../db";
import { CF_KEY, UPDATE_URL } from "../env";
import {
	getUsersWithMatchedPermission,
	readPermission,
} from "../permission";
import { ticketEffectManager } from "../ticket/effect";
import {
	storeDelete,
	storeGet,
	storeGetAll,
	storeSet,
} from "../pluginStore";
import { settings } from "../settings";
import { appEvents, type PluginEnvKey } from "./appEvents";

/**
 * Registers the core-side handlers backing every data-access channel exposed
 * to plugins. Must be called once at startup, before any plugin code runs.
 */
export function registerCoreDataHandlers() {
	appEvents.handle("artifact:list", ({ serverId, provider }) =>
		getServerArtifactsByServerId(serverId, provider),
	);

	appEvents.handle("artifact:track", (params) =>
		upsertServerArtifact(params),
	);

	appEvents.handle(
		"artifact:delete",
		({ provider, artifactId, versionId, serverId }) =>
			deleteServerArtifactRecord(provider, artifactId, versionId, serverId),
	);

	appEvents.handle("identity:getByExternal", ({ pluginId, externalId }) =>
		getIdentityByExternalId(pluginId, externalId),
	);

	appEvents.handle("identity:getByDiscord", ({ pluginId, discordId }) =>
		getIdentitiesByDiscordId(pluginId, discordId),
	);

	appEvents.handle("identity:link", (params) => createIdentityLink(params));

	appEvents.handle("identity:unlink", async ({ pluginId, externalId }) =>
		Boolean(await deleteIdentityLink(pluginId, externalId)),
	);

	appEvents.handle(
		"identity:updateMetadata",
		({ pluginId, externalId, metadata }) =>
			updateIdentityMetadata(pluginId, externalId, metadata),
	);

	appEvents.handle("db:getAllServers", () => getAllServers());
	appEvents.handle("db:getServerById", ({ id }) => selectServerById(id));
	appEvents.handle("db:createServer", async (data) => {
		const server = await createServer(data);
		appEvents.emit("serverCreated", { server });
		return server;
	});
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

	appEvents.handle("credit:canSpend", ({ userId, cost }) =>
		canSpendCredit(userId, cost),
	);

	appEvents.handle("credit:refund", async (params) => {
		await refundCredit(params);
	});

	appEvents.handle("permission:getUsersWith", ({ permission }) =>
		getUsersWithMatchedPermission(permission),
	);

	appEvents.handle("ticket:getActiveEffectTypes", ({ userId }) =>
		ticketEffectManager
			.getUserActiveEffects(userId)
			.map((entry) => entry.ticket.effect.effect as string),
	);

	appEvents.handle("artifact:deleteByPath", async ({ filePath }) => {
		const { count } = await deleteServerArtifactByPath(filePath);
		return count;
	});

	const pluginEnv: Record<PluginEnvKey, string | undefined> = {
		CF_KEY,
		UPDATE_URL,
	};
	appEvents.handle("env:get", ({ key }) => pluginEnv[key]);

	appEvents.handle("store:get", ({ namespace, key }) =>
		storeGet(namespace, key),
	);
	appEvents.handle("store:getAll", ({ namespace }) => storeGetAll(namespace));
	appEvents.handle("store:set", ({ namespace, key, value }) =>
		storeSet(namespace, key, value),
	);
	appEvents.handle("store:delete", ({ namespace, key }) =>
		storeDelete(namespace, key),
	);
}
