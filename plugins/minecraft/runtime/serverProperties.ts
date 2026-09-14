/**
 * Minimal `server.properties` editing.
 *
 * The bot records a server's port(s) in its own database, but nothing in the
 * launch path passes that port to the JVM — the server binds whatever
 * `server.properties` says. Changing one without the other leaves the proxy
 * dialling a port nobody listens on, so the port editor keeps the file in step.
 *
 * Only the `server-port` line is touched; every other byte of the file — a
 * human's comments, ordering and line endings included — is left alone.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Name of the properties file, relative to the server directory. */
export const SERVER_PROPERTIES_FILE = "server.properties";

/**
 * Matches every uncommented `server-port=…` line, without eating its `\r`.
 *
 * Global because a file can carry the key more than once (a hand-appended
 * line, a merge gone wrong). `java.util.Properties` keeps the *last* one, so
 * rewriting only the first would look like a successful write that changes
 * nothing.
 */
const SERVER_PORT_LINES = /^[ \t]*server-port[ \t]*=[^\r\n]*/gm;

/** The port a properties file currently declares — the last wins, as Java does. */
function currentPort(raw: string): string | null {
	const matches = raw.match(SERVER_PORT_LINES);
	const last = matches?.at(-1);
	if (!last) return null;
	return last.slice(last.indexOf("=") + 1).trim();
}

export interface WriteServerPortOptions {
	/** Report what would change without touching the file. */
	dryRun?: boolean;
}

export type ServerPortWriteResult =
	| {
			ok: true;
			/** What the write did, for an honest report back to the operator. */
			action: "updated" | "created" | "unchanged";
			/** The port the file declared beforehand; null when it declared none. */
			previous: string | null;
			path: string;
	  }
	| { ok: false; error: string };

/**
 * Point `server-port` at {@link port}.
 *
 * Creates `server.properties` holding just that key when the file is missing
 * (a server that has never run); Minecraft fills in the remaining defaults on
 * its next start. The server only reads the file at startup, so a running
 * server keeps its old port until restarted.
 */
export async function writeServerPort(
	serverDir: string,
	port: number,
	options: WriteServerPortOptions = {},
): Promise<ServerPortWriteResult> {
	// The filename is a fixed constant, so a plain join cannot escape the
	// server directory. Keeping this module free of app imports also lets the
	// backfill tool run with nothing but a database URL.
	const path = join(serverDir, SERVER_PROPERTIES_FILE);
	const line = `server-port=${port}`;

	try {
		if (!existsSync(path)) {
			// Checked explicitly so a dry run reports a missing server
			// directory instead of promising a file it could not create.
			if (!existsSync(serverDir)) {
				return {
					ok: false,
					error: `server directory does not exist: ${serverDir}`,
				};
			}
			if (!options.dryRun) await writeFile(path, `${line}\n`, "utf8");
			return { ok: true, action: "created", previous: null, path };
		}

		const raw = await readFile(path, "utf8");
		const eol = raw.includes("\r\n") ? "\r\n" : "\n";
		const previous = currentPort(raw);

		const next =
			previous === null
				? `${raw}${raw.length === 0 || raw.endsWith("\n") ? "" : eol}${line}${eol}`
				: raw.replace(SERVER_PORT_LINES, line);

		if (next === raw)
			return { ok: true, action: "unchanged", previous, path };

		if (!options.dryRun) await writeFile(path, next, "utf8");
		return { ok: true, action: "updated", previous, path };
	} catch (err) {
		return { ok: false, error: String(err) };
	}
}
