import {
	ActivityType,
	MessagePayload,
	type Client,
	type MessageCreateOptions,
} from "discord.js";
import { join, relative, resolve } from "path";

export type PickAndOptional<
	T,
	K extends keyof T,
	O extends keyof T = never,
> = Pick<T, K> & Partial<Pick<T, O>>;

export function newTimeoutSignal(time: number) {
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
	}, time);
	return {
		signal: controller.signal,
		abort: controller.abort,
		cancel: () => clearTimeout(timeout),
	};
}

export function createDecodeWritableStream(
	onData: (chunk: string) => void,
	onClose?: () => void,
	onAbort?: (err: Error) => void,
) {
	const decoder = new TextDecoder();
	return new WritableStream<Uint8Array<ArrayBufferLike>>({
		write(chunk) {
			onData(decoder.decode(chunk));
		},
		close() {
			onClose?.();
		},
		abort(err) {
			onAbort?.(err);
		},
	});
}

export async function safeFetch(
	url: string | URL,
	options?: RequestInit,
	logError = true,
	timeout: null | number = null,
	cache = false,
) {
	if (timeout) {
		const { signal, cancel } = newTimeoutSignal(timeout);
		const opts: RequestInit = {
			...options,
			signal,
			cache: cache ? "force-cache" : "default",
		};
		try {
			try {
				return await fetch(url, opts);
			} finally {
				return cancel();
			}
		} catch (err) {
			if (logError) console.error(`Fetch error (${url}): ${err}`);
			return null;
		}
	}
	try {
		return await fetch(url, options);
	} catch (err) {
		if (logError) console.error(`Fetch error (${url}): ${err}`);
		return null;
	}
}

export function ensureSuffix(str: string, suffix: string) {
	if (str.endsWith(suffix)) return str;
	return str + suffix;
}

export function removeSuffix(str: string, suffix: string) {
	if (str.endsWith(suffix)) return str.slice(0, -suffix.length);
	return str;
}

export function trimTextWithSuffix(
	text: string,
	maxLength: number,
	suffix = "...",
) {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - suffix.length) + suffix;
}

export function setActivity(
	client: Client,
	online: boolean,
	suspended: boolean,
	minecraftVersion: string,
) {
	client.user?.setActivity({
		name: `${
			online
				? `Running Minecraft Server ${minecraftVersion}`
				: "Server offline"
		}${suspended ? " (Suspending)" : "(Public)"}`,
		type: ActivityType.Custom,
	});
}

const trueValues = ["true", "1", "yes", "on", "enable"];
const falseValues = ["false", "0", "no", "off", "disable"];

export function isTrueValue(value: string): boolean | null {
	return trueValues.includes(value.toLowerCase().trim())
		? true
		: falseValues.includes(value.toLowerCase().trim())
			? false
			: null;
}

export function randomItem<T>(item: T[]): T {
	return item[Math.floor(Math.random() * item.length)] as T;
}

/**
 * Clamp a number between a minimum and maximum value
 */
export function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

export function safeJoin(...paths: string[]) {
	const [basePath, ...remainingPaths] = paths;
	if (!basePath) throw new Error("Base path is required");
	// Normalize and resolve the base path first
	const normalizedBase = resolve(basePath);

	// Join all paths
	const joinedPath = join(basePath, ...remainingPaths);

	// Resolve the final path
	const finalPath = resolve(joinedPath);

	// Check if the resolved path is within the base directory
	const relativePath = relative(normalizedBase, finalPath);

	// Ensure the relative path doesn't start with ".." or is absolute
	if (
		relativePath.startsWith("..") ||
		relativePath.startsWith("/") ||
		relativePath.includes(":")
	) {
		throw new Error("Path traversal detected");
	}

	return finalPath;
}

/**
 * Parse time string in various formats and return total milliseconds
 * Supported formats:
 * - DD:HH:MM:SS (days:hours:minutes:seconds) - first part can be longer than 2 digits
 * - HH:MM:SS (hours:minutes:seconds)
 * - MM:SS (minutes:seconds)
 * - S (seconds with 's' suffix, e.g., "102s")
 */
export function parseTimeString(timeStr: string): number | null {
	if (!timeStr || typeof timeStr !== "string") {
		return null;
	}

	const trimmedStr = timeStr.trim();

	// Handle seconds format like "102s"
	const secondsMatch = trimmedStr.match(/^(\d+)s$/i);
	if (secondsMatch) {
		const seconds = Number(secondsMatch[1]);
		return seconds * 1000;
	}

	// Handle colon-separated formats
	const parts = trimmedStr.split(":");

	if (parts.length < 2 || parts.length > 4) {
		return null;
	}

	// Parse parts as numbers
	const numParts = parts.map((part) => {
		const num = Number(part);
		return isNaN(num) ? null : num;
	});

	// Check if any part is invalid
	if (numParts.some((part) => part === null)) {
		return null;
	}

	let days = 0,
		hours = 0,
		minutes = 0,
		seconds = 0;

	if (parts.length === 4) {
		// DD:HH:MM:SS format
		days = numParts[0]!;
		hours = numParts[1]!;
		minutes = numParts[2]!;
		seconds = numParts[3]!;
	} else if (parts.length === 3) {
		// HH:MM:SS format
		hours = numParts[0]!;
		minutes = numParts[1]!;
		seconds = numParts[2]!;
	} else if (parts.length === 2) {
		// MM:SS format
		minutes = numParts[0]!;
		seconds = numParts[1]!;
	}

	// Validate ranges (except for the first part which can be unlimited)
	if (parts.length >= 3 && hours >= 24) return null;
	if (minutes >= 60) return null;
	if (seconds >= 60) return null;

	// All values must be non-negative
	if (days < 0 || hours < 0 || minutes < 0 || seconds < 0) return null;

	// Calculate total milliseconds
	const totalMs =
		days * 24 * 60 * 60 * 1000 +
		hours * 60 * 60 * 1000 +
		minutes * 60 * 1000 +
		seconds * 1000;

	return totalMs > 0 ? totalMs : null;
}

/**
 * Format time duration string from the parsed format
 * Returns a human-readable string like "7 days 12 hours" or "30 minutes"
 */
export function formatTimeDuration(timeStr: string): string | null {
	const ms = parseTimeString(timeStr);
	if (ms === null) return null;

	const totalSeconds = Math.floor(ms / 1000);
	const days = Math.floor(totalSeconds / (24 * 60 * 60));
	const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
	const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
	const seconds = totalSeconds % 60;

	const parts: string[] = [];
	if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
	if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
	if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
	if (seconds > 0) parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);

	return parts.length > 0 ? parts.join(" ") : null;
}

export async function sendMessagesToUsersById(
	client: Client,
	users: string[],
	message: MessagePayload | MessageCreateOptions | string,
) {
	for (const userId of users) {
		const user = await client.users.fetch(userId).catch(() => null);
		if (!user) continue;
		user.send(message).catch(() => {
			console.log(
				`Failed to send notification to ${user.username} (${userId})`,
			);
		});
	}
}

interface Time {
	hour: number;
	minute: number;
}

export function getNextTimestamp(time: Time) {
	const now = new Date();
	const next = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		time.hour,
		time.minute,
	);
	if (next < now) {
		next.setDate(next.getDate() + 1);
	}
	return next;
}

export function compareArrays(
	arr1: any[],
	arr2: any[],
	force = false,
): boolean {
	const sortedArr1 = force ? arr1.toSorted() : arr1;
	const sortedArr2 = force ? arr2.toSorted() : arr2;
	if (sortedArr1.length !== sortedArr2.length) return false;
	for (let i = 0; i < sortedArr1.length; i++) {
		if (sortedArr1[i] !== sortedArr2[i]) return false;
	}
	return true;
}

export function compareObjectDeep(obj1: Object, obj2: Object): boolean {
	const keys1 = Object.keys(obj1);
	const keys2 = Object.keys(obj2);
	if (!compareArrays(keys1, keys2)) return false;
	for (const key of keys1) {
		const val1 = (obj1 as any)[key];
		const val2 = (obj2 as any)[key];
		const areObjects =
			val1 !== null &&
			val2 !== null &&
			typeof val1 === "object" &&
			typeof val2 === "object";
		if (
			(areObjects && !compareObjectDeep(val1, val2)) ||
			(!areObjects && val1 !== val2)
		) {
			return false;
		}
	}
	return true;
}
