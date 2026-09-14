import { data, events } from "../api";
import { loaderTypeOf, pluginDirOf, syncConnector } from "./lib";

const TAG = "[githubConnector]";

/** Install/refresh the connector for one server, logging notable outcomes. */
async function syncForServer(serverId: number, config: unknown) {
	const pluginDir = pluginDirOf(config);
	if (!pluginDir) return; // not a plugin-dir server (e.g. a non-Minecraft game)
	const loaderType = loaderTypeOf(config);
	if (!loaderType) return; // no loader recorded, so no jar can be chosen
	const result = await syncConnector(
		serverId,
		pluginDir,
		loaderType,
	).catch((err) => {
		console.error(`${TAG} sync failed for server ${serverId}:`, err);
		return null;
	});
	if (!result) return;
	if (
		result.status === "installed" ||
		result.status === "updated" ||
		result.status === "matched"
	) {
		console.log(
			`${TAG} ${result.status} ${result.assetName} (${result.tag}) for server ${serverId}`,
		);
		return;
	}
	// A loader with no matching jar is a silent no-op otherwise, which is how a
	// wrong-platform install went unnoticed in the first place.
	if (result.status === "noAsset") {
		console.warn(`${TAG} server ${serverId}: ${result.message}`);
	}
}

export default async function run() {
	// 1. On startup, ensure every existing server has the connector.
	const servers = await data.request("db:getAllServers").catch(() => []);
	for (const server of servers) {
		void syncForServer(server.id, server.config);
	}

	// 2. Install into any newly-created server (reuses the same install path).
	events.on("serverCreated", ({ server }) => {
		void syncForServer(server.id, server.config);
	});

	// 3. Re-check for updates whenever a server is started.
	events.on("commandCalled", ({ commandName, server }) => {
		if (commandName !== "startserver" || !server) return;
		void syncForServer(server.id, server.getPluginConfig());
	});
}
