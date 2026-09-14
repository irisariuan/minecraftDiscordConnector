import { data, events } from "../api";
import { pluginDirOf, syncConnector } from "./lib";

const TAG = "[githubConnector]";

/** Install/refresh the connector for one server, logging notable outcomes. */
async function syncForServer(serverId: number, config: unknown) {
	const pluginDir = pluginDirOf(config);
	if (!pluginDir) return; // not a plugin-dir server (e.g. a non-Minecraft game)
	const result = await syncConnector(serverId, pluginDir).catch((err) => {
		console.error(`${TAG} sync failed for server ${serverId}:`, err);
		return null;
	});
	if (
		result &&
		(result.status === "installed" ||
			result.status === "updated" ||
			result.status === "matched")
	) {
		console.log(
			`${TAG} ${result.status} ${result.assetName} (${result.tag}) for server ${serverId}`,
		);
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
