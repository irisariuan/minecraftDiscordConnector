import bodyParser from "body-parser";
import cors from "cors";
import { randomBytes } from "crypto";
import "dotenv/config";
import EventEmitter from "events";
import express, { type Express } from "express";
import { existsSync } from "fs";
import type { Server } from "http";
import multer from "multer";
import { handler as ssrHandler } from "../../webUi/dist/server/entry.mjs";
import { CORS_ORIGIN } from "../env";
import { safeJoin } from "../utils";
import {
	generateSessionId,
	TokenType,
	type CreateEditTokenParams,
	type Diff,
	type EditFile,
	type FileBuffer,
} from "./uploadServer/utils";
import { setupVerifyEndpoint } from "./uploadServer/verifyEndpoint";
import { setupFileEndpoint } from "./uploadServer/fileEndpoint";
import { setupUploadEndpoint } from "./uploadServer/uploadEndpoint";
import { setupEditEndpoint } from "./uploadServer/editEndpoint";
import { setupDeleteTokenEndpoint } from "./uploadServer/deleteTokenEndpoint";

function createUploadServer(uploadServer: UploadServer) {
	const app = express();
	const upload = multer({
		limits: {
			fileSize: 1024 * 1024 * 1024, // 1GB limit
		},
	});
	const jsonParser = bodyParser.json();

	app.use(cors({ origin: CORS_ORIGIN ?? "*" }));
	app.use(
		"/",
		express.static(safeJoin(process.cwd(), "webUi", "dist", "client")),
	);
	app.use(ssrHandler);

	// Setup endpoints
	app.get("/api/verify/:id", setupVerifyEndpoint(uploadServer));
	app.get("/api/file/:id", setupFileEndpoint(uploadServer));
	app.post(
		"/api/upload/:id",
		upload.single("upload"),
		setupUploadEndpoint(uploadServer),
	);
	app.post("/api/edit/:id", jsonParser, setupEditEndpoint(uploadServer));
	app.delete(
		"/api/token/:id",
		jsonParser,
		setupDeleteTokenEndpoint(uploadServer),
	);

	return app;
}

export class UploadServer extends EventEmitter {
	port: number;
	hosting: boolean;
	hostAddress: string;
	activeTokens: Set<string>;
	allTokens: Set<string>;
	tokenTypeMap: Map<string, TokenType>;
	fileTokenMap: Map<string, FileBuffer>;
	/**
	 * @description Map<editToken, EditFile>
	 */
	editTokenMap: Map<string, EditFile>;
	/**
	 * @description Map<sessionId, diffContent>
	 */
	private diffContent: Map<string, Diff>;
	autoHost: boolean;
	acceptedExtensions: string[];
	private app: Express;
	private server: Server | null;

	constructor(
		port = 6003,
		hostAddress = "0.0.0.0",
		extensions = [".jar", ".yaml", ".yml", ".conf", ".zip"],
	) {
		super();
		this.port = port;
		this.hosting = false;
		this.hostAddress = hostAddress;
		this.activeTokens = new Set();
		this.allTokens = new Set();
		this.fileTokenMap = new Map();
		this.editTokenMap = new Map();
		this.diffContent = new Map();

		this.tokenTypeMap = new Map();
		this.server = null;
		this.app = createUploadServer(this);
		this.autoHost = true;
		this.acceptedExtensions = extensions;
	}
	host() {
		if (this.hosting) return;
		this.server = this.app.listen(this.port, this.hostAddress, () => {
			this.hosting = true;
			console.log(
				`Upload server listening on http://${this.hostAddress}:${this.port}`,
			);
		});
	}

	newDiff(sessionId: string, content: string) {
		if (this.diffContent.has(sessionId))
			throw new Error("Diff already exists");
		this.diffContent.set(sessionId, {
			content,
			token: this.createToken(TokenType.EditDiffToken),
		});
	}

	getDiff(sessionId: string): Diff | null {
		return this.diffContent.get(sessionId) ?? null;
	}
	deleteDiff(sessionId: string) {
		this.diffContent.delete(sessionId);
	}

	hasActiveToken(
		token: string | null | undefined,
		type: TokenType | TokenType[] | null,
	) {
		if (token === null || token === undefined) return false;
		if (Array.isArray(type)) {
			const returned = this.tokenTypeMap.get(token);
			return (
				returned &&
				this.activeTokens.has(token) &&
				type.includes(returned)
			);
		}
		return (
			this.activeTokens.has(token) &&
			(type === null || this.tokenTypeMap.get(token) === type)
		);
	}
	hasToken(token: string | null | undefined) {
		if (token === null || token === undefined) return false;
		return this.allTokens.has(token);
	}

	createFileToken() {
		return this.createToken(TokenType.FileToken);
	}

	createEditToken({
		file,
		type,
		sessionId,
		bypassFileExistCheck = false,
	}: CreateEditTokenParams) {
		try {
			const path = safeJoin(file.containingFolderPath, file.filename);
			if (
				!bypassFileExistCheck &&
				type !== TokenType.EditDiffToken &&
				!existsSync(path)
			)
				return null;
			const token = this.createToken(type);
			const finalSessionId = sessionId ?? generateSessionId();
			this.editTokenMap.set(token, {
				...file,
				sessionId: finalSessionId,
			});
			return { token, sessionId: finalSessionId };
		} catch {
			return null;
		}
	}

	private createToken(type: TokenType) {
		const token = randomBytes(16).toString("hex");
		if (this.activeTokens.has(token)) throw new Error("Token collision");
		this.activeTokens.add(token);
		this.allTokens.add(token);
		this.tokenTypeMap.set(token, type);
		if (this.autoHost) this.host();
		return token;
	}

	getTokenType(token: string) {
		return this.tokenTypeMap.get(token);
	}

	/**
	 * @param timeout The time in milliseconds to wait for the edit token to be used (default 1 hour), <= 0 for infinite
	 */
	awaitFileToken(token: string, timeout = 1000 * 60 * 5) {
		if (!this.hasActiveToken(token, TokenType.FileToken))
			return Promise.reject(new Error("Invalid token"));
		return new Promise<FileBuffer>((resolve, reject) => {
			let tid: NodeJS.Timeout;
			const listener = (usedToken: string, file?: FileBuffer) => {
				if (usedToken === token) {
					this.off("tokenUsed", listener);
					this.off("tokenDeleted", listener);
					clearTimeout(tid);
					if (file) return resolve(file);
					return reject(new Error("Token was disposed"));
				}
			};
			this.on("tokenUsed", listener);
			this.on("tokenDeleted", listener);
			if (timeout > 0) {
				tid = setTimeout(() => {
					this.off("tokenUsed", listener);
					this.off("tokenDeleted", listener);
					this.checkTokens();
					reject(new Error("Timeout waiting for token usage"));
				}, timeout);
			}
		});
	}

	/**
	 * @param timeout The time in milliseconds to wait for the edit token to be used (default 1 hour), <= 0 for infinite
	 * Rejects when timeout, return null if it is deleted early
	 */
	awaitEditToken(token: string, timeout = 1000 * 60 * 60) {
		const file = this.editTokenMap.get(token);
		if (
			!this.hasActiveToken(token, [
				TokenType.EditToken,
				TokenType.EditDiffToken,
				TokenType.EditForceToken,
			]) ||
			!file
		)
			return Promise.reject(new Error("Invalid token"));
		return new Promise<EditFile | null>((resolve, reject) => {
			let tid: NodeJS.Timeout;
			const tokenUsedListener = (usedToken: string) => {
				if (usedToken === token) {
					this.off("tokenUsed", tokenUsedListener);
					this.off("tokenDeleted", tokenDeletedListner);
					clearTimeout(tid);
					resolve(file);
				}
			};
			const tokenDeletedListner = (usedToken: string) => {
				if (usedToken === token) {
					this.off("tokenUsed", tokenUsedListener);
					this.off("tokenDeleted", tokenDeletedListner);
					clearTimeout(tid);
					resolve(null);
				}
			};
			this.on("tokenUsed", tokenUsedListener);
			this.on("tokenDeleted", tokenDeletedListner);
			if (timeout > 0) {
				tid = setTimeout(() => {
					this.off("tokenUsed", tokenUsedListener);
					this.off("tokenDeleted", tokenDeletedListner);
					this.checkTokens();
					reject();
				}, timeout);
			}
		});
	}

	/**
	 * Consume an edit token, would not free associated session or diff
	 */
	useEditToken(token: string) {
		if (
			this.hasActiveToken(token, [
				TokenType.EditToken,
				TokenType.EditDiffToken,
				TokenType.EditForceToken,
			])
		) {
			this.activeTokens.delete(token);
			this.editTokenMap.delete(token);
			this.emit("tokenUsed", token);
			this.checkTokens();
			return true;
		}
		return false;
	}

	/**
	 * @param timeout The time in milliseconds before the file expires (default 1 hour, let staff check the file)
	 */
	useFileToken(token: string, file: FileBuffer, timeout = 1000 * 60 * 60) {
		if (this.hasActiveToken(token, TokenType.FileToken)) {
			this.activeTokens.delete(token);
			this.fileTokenMap.set(token, file);
			this.emit("tokenUsed", token, file);
			setTimeout(() => {
				this.fileTokenMap.delete(token);
				this.checkTokens();
			}, timeout);
			this.checkTokens();
			return true;
		}
		return false;
	}

	/**
	 * Delete a token and free associated resources (like diffs and sessions)
	 */
	disposeToken(token: string) {
		this.activeTokens.delete(token);
		this.fileTokenMap.delete(token);
		const editFile = this.editTokenMap.get(token);
		if (editFile) {
			this.editTokenMap.delete(token);
			this.deleteDiff(editFile.sessionId);
		}
		this.emit("tokenDelete", token);
		this.checkTokens();
	}

	checkTokens() {
		if (
			this.activeTokens.size === 0 &&
			this.fileTokenMap.size === 0 &&
			this.autoHost
		) {
			this.stopHost();
		}
	}

	stopHost() {
		if (!this.hosting) return;
		console.log(
			"No active tokens or files, stopping upload server to save resources.",
		);
		this.server?.close();
		this.hosting = false;
		this.server = null;
	}

	on(event: "tokenDeleted", listener: (token: string) => unknown): this;
	on(
		event: "tokenUsed",
		listener: (token: string, file: FileBuffer) => unknown,
	): this;
	on(event: string, listener: (...args: any[]) => unknown): this {
		return super.on(event, listener);
	}
}

export const uploadServer = new UploadServer();
