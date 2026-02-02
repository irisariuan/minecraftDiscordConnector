import bodyParser from "body-parser";
import cors from "cors";
import { randomBytes } from "crypto";
import "dotenv/config";
import EventEmitter from "events";
import express, { type Express } from "express";
import { existsSync } from "fs";
import { readFile, rename, writeFile } from "fs/promises";
import type { Server } from "http";
import multer from "multer";
import { handler as ssrHandler } from "../../webUi/dist/server/entry.mjs";
import { CORS_ORIGIN } from "../env";
import { safeJoin } from "../utils";
import {
	generateSessionId,
	TokenType,
	UploadRequestSchema,
	type CreateEditTokenParams,
	type Diff,
	type EditFile,
	type FileBuffer,
} from "./uploadServer/utils";

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

	app.get("/api/verify/:id", (req, res) => {
		if (!req.params.id) {
			return res.status(403).send("Forbidden");
		}
		if (uploadServer.hasActiveToken(req.params.id, null)) {
			return res.status(200).send({
				valid: true,
				uploaded: !uploadServer.hasActiveToken(
					req.params.id,
					TokenType.FileToken,
				),
				edited: !uploadServer.hasActiveToken(req.params.id, [
					TokenType.EditToken,
					TokenType.EditDiffToken,
					TokenType.EditForceToken,
				]),
			});
		}
		return res
			.status(200)
			.send({ valid: false, uploaded: false, edited: false });
	});
	app.get("/api/file/:id", (req, res) => {
		if (!req.params.id || !uploadServer.fileTokenMap.has(req.params.id))
			return res.status(404).send("Not Found");

		const file = uploadServer.fileTokenMap.get(req.params.id);
		if (!file) {
			return res.status(404).send("Not Found");
		}
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="${file.filename}"`,
		);
		res.setHeader("Content-Type", "application/octet-stream");
		return res.status(200).send(file.buffer);
	});
	app.post("/api/upload/:id", upload.single("upload"), (req, res) => {
		if (
			!req.params.id ||
			!uploadServer.hasActiveToken(req.params.id, TokenType.FileToken)
		) {
			return res.status(403).send("Forbidden");
		}
		// Handle file upload here
		if (!req.file) {
			return res.status(400).send("No file uploaded");
		}
		if (
			!uploadServer.acceptedExtensions.some((v) =>
				req.file?.originalname.endsWith(v),
			)
		) {
			return res
				.status(400)
				.send(
					`Invalid file type. Accepted types: ${uploadServer.acceptedExtensions.join(", ")}`,
				);
		}
		console.log(`Received file: ${req.file?.originalname}`);
		const file: FileBuffer = {
			buffer: req.file.buffer,
			filename: req.file.originalname,
		};
		if (uploadServer.useFileToken(req.params.id, file)) {
			return res.status(200).send("File uploaded successfully");
		} else {
			return res.status(500).send("Unexpected token usage failed");
		}
	});
	app.post("/api/edit/:id", jsonParser, async (req, res) => {
		if (
			!req.params.id ||
			!uploadServer.hasActiveToken(req.params.id, [
				TokenType.EditToken,
				TokenType.EditForceToken,
				TokenType.EditDiffToken,
			])
		) {
			return res.status(403).send("Forbidden");
		}
		const parsed = UploadRequestSchema.safeParse(req.body);
		if (!req.body || !parsed.success) {
			return res.status(400).send("Invalid request body");
		}
		const file = uploadServer.editTokenMap.get(req.params.id);
		/**
		 * @description with dot
		 */
		const extension = file?.filename
			.substring(file.filename.lastIndexOf("."))
			.slice(1);
		const action = parsed.data.action;
		if (!file || !extension) {
			return res
				.status(500)
				.send("Unexpected missing filename or extension");
		}
		switch (action) {
			case "metadata": {
				return res.status(200).send({
					filename: file.filename,
					extension,
					isDiff:
						uploadServer.getTokenType(req.params.id) ===
						TokenType.EditDiffToken,
					isForce:
						uploadServer.getTokenType(req.params.id) ===
						TokenType.EditForceToken,
				});
			}
			case "fetch": {
				const filepath = safeJoin(
					file.containingFolderPath,
					file.filename,
				);
				if (!existsSync(filepath)) return res.send("");
				if (
					uploadServer.getTokenType(req.params.id) ===
					TokenType.EditDiffToken
				) {
					const rawContent = await readFile(filepath, "utf-8").catch(
						() => "",
					);
					const diff = uploadServer.getDiff(file.sessionId);
					if (diff) {
						return res.status(200).send(
							JSON.stringify({
								edited: diff.content,
								raw: rawContent,
							}),
						);
					} else {
						uploadServer.useEditToken(req.params.id);
						return res
							.status(404)
							.send("No diff content available");
					}
				}
				return res.sendFile(filepath);
			}
			case "edit": {
				const { editedContent } = parsed.data;
				switch (uploadServer.getTokenType(req.params.id)) {
					case TokenType.EditToken: {
						uploadServer.useEditToken(req.params.id);
						uploadServer.newDiff(file.sessionId, editedContent);
						return res
							.status(200)
							.send("Uploaded content received");
					}
					case TokenType.EditForceToken:
					case TokenType.EditDiffToken: {
						console.log(`Received edited file: ${file.filename}`);
						return await writeFile(
							safeJoin(file.containingFolderPath, file.filename),
							editedContent,
							"utf-8",
						)
							.catch((err) => {
								console.error(
									"Error writing edited file:",
									err,
								);
								return res
									.status(500)
									.send("Error writing edited file");
							})
							.then(() => {
								uploadServer.useEditToken(req.params.id);
								uploadServer.disposeToken(req.params.id);
								return res
									.status(200)
									.send("File edited successfully");
							});
					}
					default:
						return res.status(400).send("Invalid edit token type");
				}
			}
			case "rename": {
				const { newFilename } = parsed.data;
				// Validate new filename
				const finalPath = safeJoin(
					file.containingFolderPath,
					newFilename,
				);
				await rename(file.filename, finalPath);
				return res.status(200).send("File renamed successfully");
			}
			case "delete": {
				await rename(file.filename, `${file}.deleted`);
				return res.status(200).send("File deleted successfully");
			}
			default:
				return res.status(400).send("Invalid action");
		}
	});
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
		if (
			!bypassFileExistCheck &&
			type !== TokenType.EditDiffToken &&
			!existsSync(safeJoin(file.containingFolderPath, file.filename))
		)
			return null;
		const token = this.createToken(type);
		const finalSessionId = sessionId ?? generateSessionId();
		this.editTokenMap.set(token, {
			...file,
			sessionId: finalSessionId,
		});
		return { token, sessionId: finalSessionId };
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
		return new Promise<EditFile>((resolve, reject) => {
			let tid: NodeJS.Timeout;
			const listener = (usedToken: string) => {
				if (usedToken === token) {
					this.off("tokenUsed", listener);
					this.off("tokenDeleted", listener);
					clearTimeout(tid);
					resolve(file);
				}
			};
			this.on("tokenUsed", listener);
			this.on("tokenDeleted", listener);
			if (timeout > 0) {
				tid = setTimeout(() => {
					this.off("tokenUsed", listener);
					this.off("tokenDeleted", listener);
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
