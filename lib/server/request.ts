import { newTimeoutSignal, safeFetch } from "../utils";

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
	const { signal, cancel } = newTimeoutSignal(1000 * 3);
	const alive = await safeFetch(
		`http://localhost:${apiPort}/ping`,
		{
			signal,
		},
		false,
	);
	if (alive?.ok) cancel();
	return alive?.ok ?? false;
}
