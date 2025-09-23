import { spawn, type Subprocess } from "bun";
import { CacheItem } from "./cache";
import { isServerAlive, type LogLine } from "./request";
import { join } from "node:path";
import { createDisposableWritableStream, safeFetch } from "./utils";
import { EventEmitter } from "node:stream";
import { stripVTControlCharacters } from "node:util";

if (
	!process.env.SERVER_DIR ||
	!(await Bun.file(join(process.env.SERVER_DIR, "start.sh")).exists())
)
	throw new Error("SERVER_DIR environment variable is not set");

interface ServerManagerOptions {
	shutdownAllowedTime?: number;
}

const serverTypeRef = {
	INFO: "info",
	WARN: "warn",
	ERROR: "error",
} as const;

class ServerMessageEmitter extends EventEmitter {
	emitMessage(message: string) {
		this.emit("message", message);
	}
	onMessage(listener: (message: string) => void) {
		this.on("message", listener);
	}
	onceMessage(listener: (message: string) => void) {
		this.once("message", listener);
	}
	removeMessageListener(listener: (message: string) => void) {
		this.off("message", listener);
	}
}

class ServerManager {
	private instance: Subprocess<"ignore", "pipe", "inherit"> | null;
	private waitingToShutdown: boolean;
	isOnline: CacheItem<boolean>;
	serverMessageEmitter: ServerMessageEmitter;
	outputLines: LogLine[];
	shutdownAllowedTime: number;
	timeouts: NodeJS.Timeout[];

	constructor({ shutdownAllowedTime }: ServerManagerOptions) {
		this.instance = null;
		this.outputLines = [];
		this.timeouts = [];
		this.serverMessageEmitter = new ServerMessageEmitter();
		this.isOnline = new CacheItem<boolean>(false, {
			interval: 1000 * 5,
			ttl: 1000 * 5,
			updateMethod: isServerAlive,
		});
		this.waitingToShutdown = false;
		this.shutdownAllowedTime = shutdownAllowedTime ?? 3000;
	}

	captureNextLineOfOutput() {
		if (!this.instance) return null;
		return new Promise<string>((r) => {
			this.serverMessageEmitter.onceMessage((message) => r(message));
		});
	}

	captureLastLineOfOutput() {
		if (!this.instance) return null;
		return this.outputLines.at(-1) ?? null;
	}

	captureSomeOutput(ms: number, maxLines = -1) {
		if (!this.instance) return null;
		return new Promise<string[]>((r) => {
			const timeout = setTimeout(() => {
				this.serverMessageEmitter.removeMessageListener(listener);
				r(result);
			}, ms);
			const result: string[] = [];
			const listener = (message: string) => {
				result.push(message);
				if (maxLines > 0 && result.length >= maxLines) {
					this.serverMessageEmitter.removeMessageListener(listener);
					clearTimeout(timeout);
					r(result);
				}
			};
			this.serverMessageEmitter.onMessage(listener);
		});
	}

	async start() {
		if (this.instance || (await this.isOnline.getData(true))) return null;
		this.instance = spawn(["sh", "./start.sh"], {
			cwd: process.env.SERVER_DIR,
			detached: true,
			stdin: "ignore",
			stdout: "pipe",
			onExit: (subprocess, exitCode, signalCode, error) => {
				console.log(
					`Server process exited with code ${exitCode} and signal ${signalCode}`,
				);
				if (error) {
					console.error(`Error: ${error}`);
				}
				this.cleanup();
			},
		});
		this.isOnline.setData(true);

		this.instance.stdout.pipeTo(
			createDisposableWritableStream((chunk) => {
				console.log(`[Minecraft Server] ${chunk}`);
				this.serverMessageEmitter.emitMessage(chunk);
				const unformattedChunk = stripVTControlCharacters(chunk);
				const [timestamp, level] = unformattedChunk
					.match(/(?<=\[).+?(?=\])/)
					?.at(0)
					?.split(" ") ?? [null, null];
				const textContent =
					unformattedChunk.match(/(?<=\[.+\]: ).+/)?.[0] ??
					unformattedChunk;
				this.outputLines.push({
					timestamp: timestamp || null,
					type:
						serverTypeRef[level as keyof typeof serverTypeRef] ??
						"unknown",
					message: textContent,
				});
			}),
		);
		return this.instance.pid;
	}

	async forceStop() {
		if (this.instance?.exitCode === null) {
			this.instance?.kill("SIGKILL");
			await this.instance?.exited;
			this.waitingToShutdown = false;
			return true;
		}
		return false;
	}

	async stop(tick: number) {
		if (this.waitingToShutdown || !(await this.isOnline.getData(true))) {
			console.log(
				this.waitingToShutdown
					? "Already waiting to shutdown"
					: "Server is already offline",
			);
			return { success: false };
		}
		this.waitingToShutdown = true;
		const response = await safeFetch("http://localhost:6001/shutdown", {
			body: JSON.stringify({ tick }),
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
		});
		if (!response) {
			console.error("Failed to fetch shutdown response");
			return { success: false };
		}
		const { success } = (await response.json()) as { success: boolean };
		if (!success) {
			console.error("Failed to schedule shutdown");
			return { success: false };
		}

		this.waitingToShutdown = false;
		if (tick <= 0) {
			return { success: true, promise: this.instance?.exited };
		}

		const promise = this.raceShutdown(
			(tick / 20) * 1000 + this.shutdownAllowedTime,
		);
		return { promise, success };
	}

	async raceShutdown(ms: number) {
		const promise = new Promise<void>((r) => {
			const timeout = setTimeout(async () => {
				if (await this.forceStop()) {
					console.log("Server process forcefully stopped");
				}
				const index = this.timeouts.findIndex((t) => t === timeout);
				if (index !== -1) {
					this.timeouts.splice(index, 1);
				}
				r();
			}, ms);
			this.timeouts.push(timeout);
		});
		return Promise.race([promise, this.instance?.exited]);
	}

	async haveServerSideScheduledShutdown() {
		const response = await safeFetch(
			"http://localhost:6001/shuttingDown",
		).catch();
		if (!response) return false;
		const { result } = (await response.json()) as { result: boolean };
		return result;
	}
	haveLocalSideScheduledShutdown() {
		return this.timeouts.length > 0;
	}

	cancelLocalScheduledShutdown() {
		this.waitingToShutdown = false;
		for (const timeout of this.timeouts) {
			clearTimeout(timeout);
		}
		this.timeouts = [];
	}

	async cancelServerSideShutdown() {
		if (!(await this.haveServerSideScheduledShutdown())) return false;
		const response = await safeFetch(
			"http://localhost:6001/cancelShutdown",
		);
		if (!response) return false;
		const { success } = (await response.json()) as { success: boolean };
		if (success) this.waitingToShutdown = false;
		return success;
	}

	cleanup() {
		console.log("Cleaning up server process");
		this.instance = null;
		this.isOnline.setData(false);
		this.waitingToShutdown = false;
		this.outputLines = [];
	}
}

export const serverManager = new ServerManager({});
