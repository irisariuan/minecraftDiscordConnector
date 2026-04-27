import {
	ActivityType,
	GuildMember,
	MessagePayload,
	User,
	type Client,
	type MessageCreateOptions,
} from "discord.js";
import { readdirSync, statSync } from "fs";
import { join, relative, resolve as resolvePath } from "path";

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

export function getRandomOtp(): string {
	return Math.floor(Math.random() * 999999)
		.toString()
		.padStart(6, "0");
}

export function separate<T>(arr: T[], m: number): T[][] {
	if (arr.length <= m) return [arr];
	const final: T[][] = [];
	let size = 0;
	while (size < arr.length) {
		const chunk = arr.slice(size, size + m);
		final.push(chunk);
		size += chunk.length;
	}
	return final;
}

/**
 * Limits the number of concurrent fetch requests to the same hostname.
 * Requests that exceed the cap are queued and released as active ones finish.
 */
export class DomainConcurrencyLimiter {
	defaultMaxConcurrent: number;
	defaultMaxRetry: number;
	private readonly maxConcurrent: Map<string, number> = new Map();
	private readonly queues = new Map<
		string,
		{ active: number; pending: Array<() => void> }
	>();

	constructor(maxConcurrent = 5, maxRetry = 15) {
		this.defaultMaxConcurrent = maxConcurrent;
		this.defaultMaxRetry = maxRetry;
	}

	private hostname(url: string | URL): string {
		try {
			return new URL(url).hostname;
		} catch {
			return String(url);
		}
	}

	private slot(host: string) {
		let q = this.queues.get(host);
		if (!q) {
			q = { active: 0, pending: [] };
			this.queues.set(host, q);
		}
		return q;
	}
	private getMaxConcurrent(host: string): number {
		const r = this.maxConcurrent.get(host);
		if (r !== undefined) return r;
		this.maxConcurrent.set(host, this.defaultMaxConcurrent);
		return this.defaultMaxConcurrent;
	}
	private changeMaxConcurrent(host: string, change: number) {
		const current = this.getMaxConcurrent(host);
		const newValue = Math.max(this.defaultMaxConcurrent, current + change);
		this.maxConcurrent.set(host, newValue);
	}

	private async _fetch(
		url: string | URL,
		options?: RequestInit,
		retry = 0,
	): Promise<Response> {
		const host = this.hostname(url);
		const q = this.slot(host);

		if (q.active >= this.getMaxConcurrent(host)) {
			await new Promise<void>((resolve) => q.pending.push(resolve));
		}

		q.active++;
		// Use a definite-assignment assertion — res is always assigned before
		// use because fetch() throwing causes the error to propagate before
		// `return res` is ever reached.
		let res: Response;
		let retryDelay: number | null = null;
		try {
			res = await fetch(url, options);
			if (!res.ok) {
				this.changeMaxConcurrent(host, -1);
				if (res.status === 429 && retry < this.defaultMaxRetry) {
					// Record the delay but do NOT await or recurse here.
					// The slot must be released (finally) before we wait and
					// retry — otherwise the recursive _fetch call would queue
					// behind a slot that is still held by this call, causing
					// a deadlock when all slots are occupied.
					retryDelay =
						(Number(res.headers.get("Retry-After")) || 0) +
						1000 * 2 ** retry;
				}
			} else {
				this.changeMaxConcurrent(host, 1);
			}
		} finally {
			// Always release the slot so waiting requests can proceed.
			q.active--;
			q.pending.shift()?.();
		}

		// Slot is now free. Wait outside of any slot and then retry fresh.
		if (retryDelay !== null) {
			await new Promise((r) => setTimeout(r, retryDelay));
			return this._fetch(url, options, retry + 1);
		}

		return res;
	}

	async fetch(url: string | URL, options?: RequestInit): Promise<Response> {
		return this._fetch(url, options);
	}

	/** Snapshot of per-domain concurrency state, useful for debugging. */
	stats(): Record<string, { active: number; queued: number }> {
		const out: Record<string, { active: number; queued: number }> = {};
		for (const [host, q] of this.queues) {
			out[host] = { active: q.active, queued: q.pending.length };
		}
		return out;
	}
}

/** Global limiter — max 5 concurrent requests per domain. */
export const fetchLimiter = new DomainConcurrencyLimiter(5);

export async function safeFetch(
	url: string | URL,
	options?: RequestInit,
	logError = true,
	timeout: null | number = null,
	cache = false,
): Promise<Response | null> {
	let cancel: (() => void) | undefined;
	const opts: RequestInit = {
		...options,
		...(cache ? { cache: "force-cache" } : {}),
	};

	if (timeout) {
		const tc = newTimeoutSignal(timeout);
		opts.signal = tc.signal;
		cancel = tc.cancel;
	}

	try {
		const res = await fetchLimiter.fetch(url, opts);
		cancel?.();
		return res;
	} catch (err) {
		cancel?.();
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
export function removePrefix(str: string, prefix: string) {
	if (str.startsWith(prefix)) return str.slice(prefix.length);
	return str;
}
export function ensurePrefix(str: string, prefix: string) {
	if (str.startsWith(prefix)) return str;
	return prefix + str;
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
	const normalizedBase = resolvePath(basePath);

	// Join all paths
	const joinedPath = join(basePath, ...remainingPaths);

	// Resolve the final path
	const finalPath = resolvePath(joinedPath);

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

export function safeJoinWithoutError(...paths: string[]) {
	const [basePath, ...remainingPaths] = paths;
	if (!basePath) return null;
	// Normalize and resolve the base path first
	const normalizedBase = resolvePath(basePath);

	// Join all paths
	const joinedPath = join(basePath, ...remainingPaths);

	// Resolve the final path
	const finalPath = resolvePath(joinedPath);

	// Check if the resolved path is within the base directory
	const relativePath = relative(normalizedBase, finalPath);

	// Ensure the relative path doesn't start with ".." or is absolute
	if (
		relativePath.startsWith("..") ||
		relativePath.startsWith("/") ||
		relativePath.includes(":")
	) {
		return null;
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
 * Parses an expiration input into an absolute Date.
 *
 * Absolute date formats (interpreted in local time):
 *   +HH:MM              today at HH:MM (e.g. +14:30 = today at 14:30)
 *   +HH:MM:SS           today at HH:MM:SS
 *   YYYY/M/D            midnight on that date
 *   M/D                 midnight on that date in the current year
 *   YYYY/M/D+HH:MM      that date at HH:MM  (+ is a separator, not UTC offset)
 *   YYYY/M/D+HH:MM:SS   that date at HH:MM:SS
 *
 * Relative duration formats (added to current time):
 *   DD:HH:MM:SS, HH:MM:SS, MM:SS, Ns  (same as parseTimeString)
 *
 * Returns null if the string cannot be parsed.
 */
export function parseExpireDate(input: string): Date | null {
	const s = input.trim();

	// +HH:MM[:SS] — today at a specific clock time
	const todayTimeMatch = s.match(/^\+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
	if (todayTimeMatch) {
		const h = Number(todayTimeMatch[1]);
		const m = Number(todayTimeMatch[2]);
		const sec =
			todayTimeMatch[3] !== undefined ? Number(todayTimeMatch[3]) : 0;
		if (h > 23 || m > 59 || sec > 59) return null;
		const now = new Date();
		return new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
			h,
			m,
			sec,
			0,
		);
	}

	// Any format containing / — absolute date
	if (s.includes("/")) {
		// Split on first + to separate date and optional time parts.
		// (Skip index 0 in case s starts with +, but that case is already
		//  handled above, so indexOf('+') will be > 0 here.)
		const plusIdx = s.indexOf("+");
		const datePart = plusIdx !== -1 ? s.slice(0, plusIdx) : s;
		const timePart = plusIdx !== -1 ? s.slice(plusIdx + 1) : null;

		const dateParts = datePart.split("/").map(Number);
		if (dateParts.some((n) => isNaN(n))) return null;

		let year: number;
		let month: number;
		let day: number;

		if (dateParts.length === 3) {
			// YYYY/M/D
			year = dateParts[0]!;
			month = dateParts[1]!;
			day = dateParts[2]!;
		} else if (dateParts.length === 2) {
			// M/D — default to current year
			year = new Date().getFullYear();
			month = dateParts[0]!;
			day = dateParts[1]!;
		} else {
			return null;
		}

		if (month < 1 || month > 12 || day < 1 || day > 31) return null;

		let h = 0,
			m = 0,
			sec = 0;
		if (timePart !== null) {
			const timeParts = timePart.split(":").map(Number);
			if (
				timeParts.some((n) => isNaN(n)) ||
				timeParts.length < 2 ||
				timeParts.length > 3
			)
				return null;
			h = timeParts[0]!;
			m = timeParts[1]!;
			sec = timeParts[2] ?? 0;
			if (h > 23 || m > 59 || sec > 59) return null;
		}

		const result = new Date(year, month - 1, day, h, m, sec, 0);
		// Guard against invalid calendar dates (e.g. Feb 30)
		if (result.getMonth() !== month - 1 || result.getDate() !== day)
			return null;
		return result;
	}

	// Fall back to duration format (relative to now)
	const ms = parseTimeString(s);
	if (ms === null) return null;
	return new Date(Date.now() + ms);
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

export function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export interface Time {
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

export interface FileInfo {
	name: string;
	isDirectory: boolean;
	size: number;
	modified: Date;
}

export function readDir(dirpath: string) {
	const files = readdirSync(dirpath, { withFileTypes: true });
	const fileInfos: FileInfo[] = files.map((file) => {
		const filePath = safeJoin(dirpath, file.name);
		const fileStat = statSync(filePath);
		return {
			name: file.name,
			isDirectory: file.isDirectory(),
			size: fileStat.size,
			modified: fileStat.mtime,
		};
	});
	return fileInfos;
}

/**
 * Join path segments together safely
 * Returns empty string if any segment is empty/null
 */
export function joinPathSafe(...segments: string[]): string | null {
	const filtered = segments.filter(
		(s) => removePrefix(removeSuffix(s, "/"), "/").length > 0,
	);
	if (filtered.length !== segments.length) return null;
	return joinPath(...filtered);
}

export function joinPath(...segments: string[]): string {
	return segments
		.map((v) => removePrefix(removeSuffix(v, "/"), "/"))
		.join("/");
}

export function joinPathWithBase(
	base: string,
	...segments: string[]
): string | null {
	const joined = joinPathSafe(...segments);
	if (joined === null) return null;
	return join(base, joined);
}

/**
 * Get the parent path by removing the last segment
 * Returns empty string if already at root
 */
export function getParentPath(path: string): string {
	if (!path) return "";
	return path.split("/").slice(0, -1).join("/");
}

/**
 * Sort FileInfo array: directories first, then alphabetically by name
 */
export function sortFileInfos(fileInfos: FileInfo[]): FileInfo[] {
	return fileInfos.sort((a, b) => {
		if (a.isDirectory !== b.isDirectory) {
			return a.isDirectory ? -1 : 1;
		}
		return a.name.localeCompare(b.name);
	});
}

/**
 * Validate path is within base directory and read directory contents
 * Returns sorted FileInfo array or empty array if invalid/not a directory
 */
export function validateAndReadDir(
	baseDir: string,
	relativePath: string,
): FileInfo[] {
	const dirpath = safeJoinWithoutError(baseDir, relativePath);
	if (!dirpath) return [];

	try {
		const stat = statSync(dirpath);
		if (!stat.isDirectory()) return [];
		const fileInfos = readDir(dirpath);
		return sortFileInfos(fileInfos);
	} catch {
		return [];
	}
}

export type ResolvableSync<T, P = void> = T | ((param: P) => T);
export type Resolvable<T, P = void> =
	| PromiseLike<T>
	| T
	| ((param: P) => T | PromiseLike<T>);

export function resolveSync<T, P extends void>(value: ResolvableSync<T, P>): T;
export function resolveSync<T, P>(value: ResolvableSync<T, P>, param: P): T;
export function resolveSync<T, P>(value: ResolvableSync<T, P>, param?: P): T {
	if (typeof value === "function") {
		return (value as (param: P) => T)(param as P);
	}
	return value;
}

export async function resolve<T, P extends void>(
	value: Resolvable<T, P>,
): Promise<T>;
export async function resolve<T, P>(
	value: Resolvable<T, P>,
	param: P,
): Promise<T>;
export async function resolve<T, P>(
	value: Resolvable<T, P>,
	param?: P,
): Promise<T> {
	if (typeof value === "function") {
		return await (value as (param: P) => T | PromiseLike<T>)(param as P);
	}
	return await value;
}

/*
 * Null if end - timeBefore is in the past
 */
export function calculateTimeDiffToNow(
	end: Date,
	timeBefore?: Time,
): number | null {
	const now = Date.now();
	const result =
		end.getTime() -
		(timeBefore !== undefined
			? timeBefore.hour * 60 * 60 * 1000 - timeBefore.minute * 60 * 1000
			: 0);
	if (result <= now) return null;
	return result - now;
}

export function extractUser(user: GuildMember | User) {
	return user instanceof GuildMember ? user.user : user;
}
export interface DetailTimeout {
	timeout: NodeJS.Timeout;
	expireTime: Date;
	startTime: Date;
}
