import { data } from "../api";
import { hostHandlers } from "./runtime/callbacks";
import { openIpcListener, setHostHandlers, socketPathFor } from "./runtime/ipc";
import type { MinecraftConfig } from "./config";

const PLUGIN_ID = "minecraft";

/**
 * Owns the bot side of the connector IPC.
 *
 * Sockets are normally opened by the `launch` lifecycle hook, but a server can
 * outlive the bot (the launcher restarts it in place), so any server that is
 * already online at startup gets its listener re-opened here. The connector
 * plugin reconnects on its own, so those servers re-attach within seconds.
 */
export default async function run() {
	setHostHandlers(hostHandlers);

	const [records, live] = await Promise.all([
		data.request("db:getAllServers"),
		data.request("server:list"),
	]);
	const online = new Set(
		live.filter((server) => server.online).map((server) => server.id),
	);

	for (const record of records) {
		if (record.pluginId !== PLUGIN_ID || !online.has(record.id)) continue;
		const { ipcSocket } = (record.config ?? {}) as Partial<MinecraftConfig>;
		try {
			await openIpcListener(
				record.id,
				socketPathFor(record.path, ipcSocket ?? null),
			);
		} catch (err) {
			console.error(
				`[minecraft] failed to re-open the IPC socket for server #${record.id}:`,
				err,
			);
		}
	}
}
