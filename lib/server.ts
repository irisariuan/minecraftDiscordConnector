import { spawn, type Subprocess } from "bun";
import type { Client } from "discord.js";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { Approval } from "./approval";
import { CacheItem } from "./cache";
import { changeCredit, sendCreditNotification } from "./credit";
import { getAllServers } from "./db";
import { type ServerConfig } from "./server/plugin/types";
import { type LogLine } from "./server/request";
import {
	loadServerApprovalSetting,
	loadServerCreditSetting,
	type ApprovalSettings,
	type ServerCreditSettings,
} from "./settings";
import { SuspendingEventEmitter } from "./suspend";
import { createDecodeWritableStream, isTrueValue, safeFetch } from "./utils";

if (
	!process.env.SERVER_DIR ||
	!(await Bun.file(join(process.env.SERVER_DIR, "start.sh")).exists())
)
	throw new Error("SERVER_DIR environment variable is not set");

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

interface CreateServerOptions {
	shutdownAllowedTime?: number;
	defaultSuspending?: boolean;
	config: ServerConfig;
	serverId: number;
	creditSettings: ServerCreditSettings;
	approvalSettings: ApprovalSettings;
	gameType: ServerGameType;
	startupScript?: string;
}
const serverGameTypes = ["minecraft"] as const;
export type ServerGameType = (typeof serverGameTypes)[number];

export class Server {
	private instance: Subprocess<"ignore", "pipe", "inherit"> | null;
	private waitingToShutdown: boolean;
	isOnline: CacheItem<boolean>;
	serverMessageEmitter: ServerMessageEmitter;
	outputLines: LogLine[];
	shutdownAllowedTime: number;
	timeouts: NodeJS.Timeout[];
	suspendingEvent: SuspendingEventEmitter;
	approvalList: Map<string, Approval>;
	creditSettings: ServerCreditSettings;
	approvalSettings: ApprovalSettings;
	gameType: ServerGameType;
	startupScript?: string;
	readonly config: ServerConfig;
	readonly id: number;

	constructor({
		shutdownAllowedTime,
		defaultSuspending = isTrueValue(process.env.DEFAULT_SUSPENDING || "") ??
			false,
		serverId,
		config,
		creditSettings,
		approvalSettings,
		gameType,
		startupScript,
	}: CreateServerOptions) {
		this.instance = null;
		this.gameType = gameType;
		this.startupScript = startupScript;
		this.outputLines = [];
		this.timeouts = [];
		this.approvalList = new Map();
		this.config = config;
		this.id = serverId;
		this.creditSettings = creditSettings;
		this.approvalSettings = approvalSettings;
		this.serverMessageEmitter = new ServerMessageEmitter();
		this.suspendingEvent = new SuspendingEventEmitter(defaultSuspending);
		this.isOnline = new CacheItem<boolean>(false, {
			interval: 1000 * 5,
			ttl: 1000 * 5,
			updateMethod: async () => {
				return this.instance?.exitCode === null;
			},
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
		this.instance = spawn(["sh", this.startupScript ?? "./start.sh"], {
			cwd: this.config.serverDir,
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
			createDecodeWritableStream((chunk) => {
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
					timestamp: timestamp ?? null,
					type:
						serverTypeRef[level as keyof typeof serverTypeRef] ??
						"unknown",
					message: textContent,
				});
			}),
		);
		return this.instance.pid;
	}

	async forceStop(exitCode: number | NodeJS.Signals = "SIGKILL") {
		if (this.instance?.exitCode === null) {
			this.instance?.kill(exitCode);
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
		if (this.config.apiPort === null) {
			return {
				success: true,
				promise: new Promise<void>((r) => {
					setTimeout(
						async () => {
							if (this.instance?.exitCode !== null) return;
							if (
								this.waitingToShutdown &&
								(await this.forceStop(0))
							) {
								console.log(
									"Server process forcefully stopped",
								);
							}
							this.waitingToShutdown = false;
							r();
						},
						(tick * 1000) / 20,
					);
				}),
			};
		}
		const response = await safeFetch(
			`http://localhost:${this.config.apiPort}/shutdown`,
			{
				body: JSON.stringify({ tick }),
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
			},
		);
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
			`http://localhost:${this.config.apiPort}/shuttingDown`,
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
		if (
			this.config.apiPort === null ||
			!(await this.haveServerSideScheduledShutdown())
		)
			return false;
		const response = await safeFetch(
			`http://localhost:${this.config.apiPort}/cancelShutdown`,
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

export async function createServerManager() {
	const manager = new ServerManager();
	await manager.loadServers();
	return manager;
}

/**
 * Call `createServerManager` to create instance, **DO NOT** create it directly.
 */
export class ServerManager {
	private servers: Map<number, Server>;

	constructor() {
		this.servers = new Map();
	}
	async loadServers() {
		this.servers.clear();
		for (const server of await getAllServers()) {
			if (!serverGameTypes.includes(server.gameType as ServerGameType))
				throw new Error(`Unknown server game type: ${server.gameType}`);
			this.servers.set(
				server.id,
				new Server({
					serverId: server.id,
					config: {
						loaderType: server.loaderType,
						minecraftVersion: server.version,
						modType: server.modType,
						pluginDir: server.pluginPath,
						serverDir: server.path,
						tag: server.tag,
						port: server.port,
						apiPort: server.apiPort,
					},
					creditSettings: await loadServerCreditSetting(server.id),
					approvalSettings: await loadServerApprovalSetting(
						server.id,
					),
					gameType: server.gameType as ServerGameType,
					startupScript: server.startupScript ?? undefined,
				}),
			);
		}
		return this.servers;
	}

	getServer(serverId: number) {
		return this.servers.get(serverId);
	}
	getAllServerEntries() {
		return Array.from(this.servers.entries());
	}

	getAllTagPairs() {
		const result: TagPair[] = [];
		for (const [id, server] of this.servers.entries()) {
			result.push({ id, tag: server.config.tag });
		}
		return result;
	}
	getServerCount() {
		return this.servers.size;
	}

	async getAllUsingPorts() {
		const ports: number[] = [];
		for (const server of this.servers.values()) {
			if (await server.isOnline.getData(true)) {
				ports.push(...server.config.port);
			}
		}
		return ports;
	}

	async exitAllServers(client: Client) {
		for (const server of this.servers.values()) {
			await exitServer(client, server);
		}
	}
}

export interface TagPair {
	id: number;
	tag: string | null;
}

async function exitServer(client: Client, server: Server) {
	const { success, promise } = await server.stop(0);
	if (success) {
		console.log("Server process shutting down");
		await promise;
		console.log("Server process stopped");
	}
	for (const [id, approval] of server.approvalList.entries()) {
		console.log(`Found approval ${id}, trying to clean up...`);
		if (approval.options.startPollFee) {
			console.log(
				`Refund ${approval.options.startPollFee} to caller ${approval.options.callerId}`,
			);
			await changeCredit({
				userId: approval.options.callerId,
				change: approval.options.startPollFee,
				serverId: server.id,
				reason: "New Approval Poll Refund",
			});
			const user = await client.users
				.fetch(approval.options.callerId)
				.catch(() => null);
			if (user) {
				await sendCreditNotification({
					user,
					creditChanged: approval.options.startPollFee,
					reason: "New Approval Poll Refund",
					serverId: server.id,
					silent: true,
				});
			}
		}
		if (approval.options.credit) {
			for (const id of approval.approvalIds.concat(
				approval.disapprovalIds,
			)) {
				await changeCredit({
					userId: id,
					change: approval.options.credit,
					reason: "Approval Reaction Refund",
					serverId: server.id,
				});
				const user = await client.users.fetch(id).catch(() => null);
				if (user) {
					await sendCreditNotification({
						user,
						creditChanged: approval.options.credit,
						reason: "Approval Reaction Refund",
						silent: true,
						serverId: server.id,
					});
				}
			}
		}
		if (approval.message.editable) {
			await approval.message.reactions.removeAll();
			await approval.message.edit({
				content: "Approval Canceled",
				embeds: [],
				components: [],
			});
			continue;
		}
		if (approval.message.deletable) {
			await approval.message.delete();
		}
	}
}
