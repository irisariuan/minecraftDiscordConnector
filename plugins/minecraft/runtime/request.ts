import { safeFetch } from "../../api";

export type LogType = "info" | "warn" | "error" | "unknown";
export interface LogLine {
	timestamp: string | null;
	type: LogType;
	message: string;
}

export async function getLogs(apiPort: number): Promise<LogLine[] | null> {
	const res = await safeFetch(`http://localhost:${apiPort}/logs`, {}, false);
	if (!res?.ok) {
		return null;
	}
	const data = await res.json();
	if (!Array.isArray(data)) {
		throw new Error("Invalid logs format");
	}
	return data;
}

export async function runCommandOnServer(apiPort: number, command: string) {
	const res = await safeFetch(`http://localhost:${apiPort}/runCommand`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			command,
		}),
	});
	if (!res?.ok) {
		return { success: false, output: null, logger: null };
	}
	const data = (await res.json()) as {
		success: boolean;
		output: string;
		logger: string;
	};
	return data;
}

export interface Player {
	name: string;
	uuid: string;
}

export async function fetchOnlinePlayers(
	apiPort: number,
): Promise<Player[] | null> {
	const res = await safeFetch(
		`http://localhost:${apiPort}/players`,
		{
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		},
		false,
	);
	if (!res?.ok) {
		return null;
	}
	const data = (await res.json()) as Player[];
	return data;
}

export function parseCommandOutput(output: string | null, success: boolean) {
	if (!success) {
		return "Command execution failed";
	}
	return output
		? `Command executed successfully\nOutput: \`${output}\``
		: "No output returned from the command.";
}

export async function isServerAlive(apiPort: number) {
	const alive = await safeFetch(
		`http://localhost:${apiPort}/ping`,
		{ signal: AbortSignal.timeout(1000 * 3) },
		false,
	);
	return alive?.ok ?? false;
}

// ─── OTP registration / linkage (moved from the core Server class) ────────────

/**
 * Register a player↔Discord link on the running Minecraft server via its
 * connector API. Returns the registered UUID on success, else null.
 */
export async function registerOnServer(
	apiPort: number,
	identifier: string,
	otp: string,
	usingPlayerName = true,
): Promise<string | null> {
	const response = await safeFetch(`http://localhost:${apiPort}/register`, {
		method: "POST",
		body: usingPlayerName
			? JSON.stringify({ playerName: identifier, otp })
			: JSON.stringify({ uuid: identifier, otp }),
	});
	if (!response?.ok) return null;
	const json = (await response.json().catch(() => null)) as {
		uuid: string;
	} | null;
	return json?.uuid ?? null;
}

/** Ask the connector API whether a UUID is registered. */
export async function isRegistered(
	apiPort: number,
	uuid: string,
): Promise<boolean> {
	const response = await safeFetch(`http://localhost:${apiPort}/registered`, {
		method: "POST",
		body: JSON.stringify({ uuid }),
	});
	return response?.ok ?? false;
}

// ─── Scheduled-shutdown control (moved from the core Server class) ─────────────

/** Schedule a server-side (tick-based) graceful shutdown. */
export async function scheduleServerShutdown(
	apiPort: number,
	tick: number,
): Promise<boolean> {
	const response = await safeFetch(`http://localhost:${apiPort}/shutdown`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ tick }),
	});
	if (!response) return false;
	const { success } = (await response.json().catch(() => ({
		success: false,
	}))) as { success: boolean };
	return success;
}

/** Whether the server currently has a server-side scheduled shutdown. */
export async function hasServerSideShutdown(apiPort: number): Promise<boolean> {
	const response = await safeFetch(
		`http://localhost:${apiPort}/shuttingDown`,
	).catch(() => null);
	if (!response) return false;
	const { result } = (await response.json().catch(() => ({
		result: false,
	}))) as { result: boolean };
	return result;
}

/** Cancel a server-side scheduled shutdown. */
export async function cancelServerSideShutdown(
	apiPort: number,
): Promise<boolean> {
	const response = await safeFetch(
		`http://localhost:${apiPort}/cancelShutdown`,
	);
	if (!response) return false;
	const { success } = (await response.json().catch(() => ({
		success: false,
	}))) as { success: boolean };
	return success;
}
