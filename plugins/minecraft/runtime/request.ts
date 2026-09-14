/**
 * Typed calls into a running server's connector plugin.
 *
 * Every call travels over the server's IPC socket (see `./ipc.ts`). A server
 * whose connector plugin is not attached — not installed, still starting, or
 * crashed — makes these return the "unavailable" value rather than throwing, so
 * callers can degrade the same way they did when the API was absent.
 */
import { connectionFor, type PluginMethods } from "./ipc";

export type LogType = "info" | "warn" | "error" | "unknown";
export interface LogLine {
	timestamp: string | null;
	type: LogType;
	message: string;
}

/** Issue one request, mapping a detached plugin or a failure to null. */
async function call<M extends keyof PluginMethods>(
	serverId: number,
	method: M,
	...args: PluginMethods[M]["params"] extends undefined
		? []
		: [PluginMethods[M]["params"]]
): Promise<PluginMethods[M]["result"] | null> {
	const connection = connectionFor(serverId);
	if (!connection) return null;
	try {
		return await connection.request(method, ...args);
	} catch (err) {
		console.error(
			`[minecraft] "${method}" failed on server #${serverId}:`,
			err instanceof Error ? err.message : err,
		);
		return null;
	}
}

export async function getLogs(serverId: number): Promise<LogLine[] | null> {
	const result = await call(serverId, "logs.get");
	return (result?.lines as LogLine[] | undefined) ?? null;
}

export async function runCommandOnServer(serverId: number, command: string) {
	const result = await call(serverId, "command.run", { command });
	return result ?? { success: false, output: null, logger: null };
}

export interface Player {
	name: string;
	uuid: string;
}

export async function fetchOnlinePlayers(
	serverId: number,
): Promise<Player[] | null> {
	const result = await call(serverId, "player.list");
	if (!result) return null;
	return result.players.map((player) => ({
		name: player.name,
		uuid: player.id,
	}));
}

export function parseCommandOutput(output: string | null, success: boolean) {
	if (!success) {
		return "Command execution failed";
	}
	return output
		? `Command executed successfully\nOutput: \`${output}\``
		: "No output returned from the command.";
}

// ─── OTP registration / linkage ───────────────────────────────────────────────

/**
 * Deliver a link OTP to a player in-game through the connector plugin.
 * Returns the resolved UUID on success, else null.
 */
export async function registerOnServer(
	serverId: number,
	identifier: string,
	otp: string,
	usingPlayerName = true,
): Promise<string | null> {
	const result = await call(serverId, "player.register", {
		...(usingPlayerName ? { playerName: identifier } : { uuid: identifier }),
		otp,
	});
	return result?.uuid ?? null;
}

/** Tell the server a UUID is now linked, lifting its join restrictions. */
export async function markVerifiedOnServer(
	serverId: number,
	uuid: string,
): Promise<boolean> {
	return (await call(serverId, "player.markVerified", { uuid })) !== null;
}

// ─── Scheduled-shutdown control ───────────────────────────────────────────────

/** Schedule a server-side (tick-based) graceful shutdown. */
export async function scheduleServerShutdown(
	serverId: number,
	tick: number,
): Promise<boolean> {
	const result = await call(serverId, "shutdown.schedule", { tick });
	return result?.success ?? false;
}

/** Whether the server currently has a server-side scheduled shutdown. */
export async function hasServerSideShutdown(serverId: number): Promise<boolean> {
	const result = await call(serverId, "shutdown.status");
	return result?.scheduled ?? false;
}

/** Cancel a server-side scheduled shutdown. */
export async function cancelServerSideShutdown(
	serverId: number,
): Promise<boolean> {
	const result = await call(serverId, "shutdown.cancel");
	return result?.success ?? false;
}
