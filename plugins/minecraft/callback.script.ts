import type { Server as HttpServer } from "node:http";
import { events } from "../api";
import { createCallbackApp } from "./runtime/apiServer";

/** Port the Minecraft connector calls back into (previously core-owned). */
const CALLBACK_PORT = 4002;

/**
 * Owns the inbound Minecraft callback HTTP server. It is opened lazily when any
 * managed server comes online and closed when the last one stops — mirroring the
 * behaviour that used to live in the core `ServerManager`.
 */
export default function run() {
	const app = createCallbackApp();
	let connection: HttpServer | null = null;

	events.on("serverStatusChanged", ({ anyOnline }) => {
		if (anyOnline && !connection) {
			connection = app.listen(CALLBACK_PORT, () =>
				console.log(
					`[minecraft] callback server listening on :${CALLBACK_PORT}`,
				),
			);
		} else if (!anyOnline && connection) {
			connection.close();
			connection = null;
		}
	});
}
