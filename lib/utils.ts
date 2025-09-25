import { ActivityType, type Client } from "discord.js";
import { MINECRAFT_VERSION } from "./plugin";
import { join } from "path";

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

export function createDisposableWritableStream(
	onData: (chunk: string) => void,
	onClose?: () => void,
	onAbort?: (err: Error) => void,
) {
	return new WritableStream<Uint8Array<ArrayBufferLike>>({
		write(chunk) {
			const decoder = new TextDecoder();
			const text = decoder.decode(chunk);
			onData(text);
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
		const opts = {
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

export function trimTextWithSuffix(text: string, maxLength: number, suffix = '...') {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - suffix.length) + suffix;
}

export function setActivity(
	client: Client,
	online: boolean,
	suspended: boolean,
) {
	client.user?.setActivity({
		name: `${
			online
				? `Running Minecraft Server ${MINECRAFT_VERSION}`
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
	const finalPath = join(...paths)
	if (!paths[0] || !finalPath.startsWith(paths[0])) {
		throw new Error("Unsafe path detected");
	}
	return finalPath;
}