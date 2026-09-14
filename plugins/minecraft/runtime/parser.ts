import { stripVTControlCharacters } from "node:util";
import type { LogLevel, ParsedLogLine } from "../../api";

const LEVEL_REF: Record<string, LogLevel> = {
	INFO: "info",
	WARN: "warn",
	ERROR: "error",
};

/**
 * Parse a Minecraft (log4j-style) console line of the form
 * `[HH:MM:SS] [Server thread/INFO]: message` into a {@link ParsedLogLine}.
 * Falls back to the raw text with an unknown level when the pattern is absent.
 */
export function parseMinecraftOutput(line: string): ParsedLogLine {
	const clean = stripVTControlCharacters(line);
	const [timestamp, level] = clean
		.match(/(?<=\[).+?(?=\])/)
		?.at(0)
		?.split(" ") ?? [null, null];
	const message = clean.match(/(?<=\[.+\]: ).+/)?.[0] ?? clean;
	return {
		timestamp: timestamp ?? null,
		type: LEVEL_REF[level as keyof typeof LEVEL_REF] ?? "unknown",
		message,
	};
}
