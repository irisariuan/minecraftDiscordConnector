import { randomBytes } from "crypto";
import EventEmitter from "events";
import { existsSync } from "fs";
import { safeJoin } from "../../utils";
import {
	generateSessionId,
	TokenType,
	type CreateEditTokenParams,
	type Diff,
	type EditFile,
	type FileBuffer,
} from "./utils";

export class TokenManager extends EventEmitter {
	private activeTokens: Set<string>;
	private allTokens: Set<string>;
	private tokenTypeMap: Map<string, TokenType>;
	private fileTokenMap: Map<string, FileBuffer>;
	private editTokenMap: Map<string, EditFile>;
	private diffContent: Map<string, Diff>;
	private fileTokenTimeouts: Map<string, NodeJS.Timeout>;

	constructor() {
		super();
		this.activeTokens = new Set();
		this.allTokens = new Set();
		this.tokenTypeMap = new Map();
		this.fileTokenMap = new Map();
		this.editTokenMap = new Map();
		this.diffContent = new Map();
		this.fileTokenTimeouts = new Map();
	}

	// Token creation methods

	createFileToken(): string {
		return this.createToken(TokenType.FileToken);
	}

	createEditToken({
		file,
		type,
		sessionId,
		bypassFileExistCheck = false,
	}: CreateEditTokenParams): { token: string; sessionId: string } | null {
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

	private createToken(type: TokenType): string {
		const token = randomBytes(16).toString("hex");
		if (this.activeTokens.has(token)) throw new Error("Token collision");
		this.activeTokens.add(token);
		this.allTokens.add(token);
		this.tokenTypeMap.set(token, type);
		this.emit("tokenCreated", token, type);
		return token;
	}

	// Token validation methods

	hasActiveToken(
		token: string | null | undefined,
		type: TokenType | TokenType[] | null,
	): boolean {
		if (token === null || token === undefined) return false;
		if (Array.isArray(type)) {
			const returned = this.tokenTypeMap.get(token);
			return (
				returned !== undefined &&
				this.activeTokens.has(token) &&
				type.includes(returned)
			);
		}
		return (
			this.activeTokens.has(token) &&
			(type === null || this.tokenTypeMap.get(token) === type)
		);
	}

	hasToken(token: string | null | undefined): boolean {
		if (token === null || token === undefined) return false;
		return this.allTokens.has(token);
	}

	getTokenType(token: string): TokenType | undefined {
		return this.tokenTypeMap.get(token);
	}

	// Token usage methods

	/**
	 * Use a file token (deactivate the file token)
	 *
	 * Upload a file to memory for a period of time
	 *
	 * fileExpired would be trigger when file is removed
	 */
	useFileToken(
		token: string,
		file: FileBuffer,
		fileValidTime = 1000 * 60 * 60,
	): boolean {
		if (this.hasActiveToken(token, TokenType.FileToken)) {
			this.activeTokens.delete(token);
			this.fileTokenMap.set(token, file);
			this.emit("tokenUsed", token, file);

			// Set up automatic cleanup after timeout
			if (fileValidTime > 0) {
				const timeoutId = setTimeout(() => {
					this.fileTokenMap.delete(token);
					this.fileTokenTimeouts.delete(token);
					this.emit("fileExpired", token);
				}, fileValidTime);
				this.fileTokenTimeouts.set(token, timeoutId);
			}

			return true;
		}
		return false;
	}

	useEditToken(token: string): boolean {
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
			return true;
		}
		return false;
	}

	// Token awaiting methods

	awaitFileToken(
		token: string,
		timeout = 1000 * 60 * 5,
	): Promise<FileBuffer> {
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
					reject(new Error("Timeout waiting for token usage"));
				}, timeout);
			}
		});
	}

	awaitEditToken(
		token: string,
		timeout = 1000 * 60 * 60,
	): Promise<EditFile | null> {
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
					this.off("tokenDeleted", tokenDeletedListener);
					clearTimeout(tid);
					resolve(file);
				}
			};
			const tokenDeletedListener = (usedToken: string) => {
				if (usedToken === token) {
					this.off("tokenUsed", tokenUsedListener);
					this.off("tokenDeleted", tokenDeletedListener);
					clearTimeout(tid);
					resolve(null);
				}
			};
			this.on("tokenUsed", tokenUsedListener);
			this.on("tokenDeleted", tokenDeletedListener);
			if (timeout > 0) {
				tid = setTimeout(() => {
					this.off("tokenUsed", tokenUsedListener);
					this.off("tokenDeleted", tokenDeletedListener);
					reject(new Error("Timeout waiting for edit token"));
				}, timeout);
			}
		});
	}

	// Token disposal methods

	/*
	 * Trigger tokenDeleted event
	 */
	deactivateToken(token: string): boolean {
		if (this.activeTokens.has(token)) {
			this.activeTokens.delete(token);
			this.emit("tokenDeleted", token);
			return true;
		}
		return false;
	}

	/*
	 * Trigger tokenDeleted event
	 */
	disposeToken(token: string): void {
		this.activeTokens.delete(token);

		// Clear file token timeout if exists
		const fileTimeout = this.fileTokenTimeouts.get(token);
		if (fileTimeout) {
			clearTimeout(fileTimeout);
			this.fileTokenTimeouts.delete(token);
		}

		this.fileTokenMap.delete(token);
		const editFile = this.editTokenMap.get(token);
		if (editFile) {
			this.editTokenMap.delete(token);
			this.deleteDiff(editFile.sessionId);
		}
		this.emit("tokenDeleted", token);
	}

	// Diff management methods

	newDiff(sessionId: string, content: string): string {
		if (this.diffContent.has(sessionId))
			throw new Error("Diff already exists");
		const diffToken = this.createToken(TokenType.EditDiffToken);
		this.diffContent.set(sessionId, {
			content,
			token: diffToken,
		});
		return diffToken;
	}

	getDiff(sessionId: string): Diff | null {
		return this.diffContent.get(sessionId) ?? null;
	}

	deleteDiff(sessionId: string): void {
		this.diffContent.delete(sessionId);
	}

	// Getters for maps (read-only access)

	getFileToken(token: string): FileBuffer | undefined {
		return this.fileTokenMap.get(token);
	}

	getEditToken(token: string): EditFile | undefined {
		return this.editTokenMap.get(token);
	}

	hasFileToken(token: string): boolean {
		return this.fileTokenMap.has(token);
	}

	// Cleanup and stats

	getActiveTokenCount(): number {
		return this.activeTokens.size;
	}

	getFileTokenCount(): number {
		return this.fileTokenMap.size;
	}

	getAllTokenCount(): number {
		return this.allTokens.size;
	}

	cleanup(): void {
		// Clear all file token timeouts
		for (const timeout of this.fileTokenTimeouts.values()) {
			clearTimeout(timeout);
		}
		this.fileTokenTimeouts.clear();
	}

	// Event type definitions
	on(
		event: "tokenCreated",
		listener: (token: string, type: TokenType) => void,
	): this;
	on(event: "tokenDeleted", listener: (token: string) => void): this;
	on(
		event: "tokenUsed",
		listener: (token: string, file?: FileBuffer) => void,
	): this;
	on(event: "fileExpired", listener: (token: string) => void): this;
	on(event: string, listener: (...args: any[]) => void): this {
		return super.on(event, listener);
	}

	emit(event: "tokenCreated", token: string, type: TokenType): boolean;
	emit(event: "tokenDeleted", token: string): boolean;
	emit(event: "tokenUsed", token: string, file?: FileBuffer): boolean;
	emit(event: "fileExpired", token: string): boolean;
	emit(event: string, ...args: any[]): boolean {
		return super.emit(event, ...args);
	}
}
