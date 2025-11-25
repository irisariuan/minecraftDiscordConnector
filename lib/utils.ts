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
