import "dotenv/config";
import express, { type Express } from "express";
import multer from "multer";
import bodyParser from "body-parser";
import z from "zod";
import { randomBytes } from "crypto";
import EventEmitter from "events";
import type { Server } from "http";
import cors from "cors";
import { handler as ssrHandler } from "../../webUi/dist/server/entry.mjs";
import { join } from "path";
import { copyFile } from "fs/promises";
import { writeFile } from "fs/promises";
import { rename } from "fs/promises";
import { safeJoin } from "../utils";

const UploadRequestSchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("edit"),
		editedContent: z.string(),
		createCopy: z.boolean().optional(),
	}),
	z.object({
		action: z.literal("rename"),
		newFilename: z.string(),
	}),
	z.object({
		action: z.literal("delete"),
	}),
]);

function createUploadServer(uploadServer: UploadServer) {
	const app = express();
	const upload = multer({
		limits: {
			fileSize: 1024 * 1024 * 1024, // 1GB limit
		},
	});
	const jsonParser = bodyParser.json();

	app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
	app.use(
		"/",
		express.static(join(process.cwd(), "webUi", "dist", "client")),
	);
	app.use(ssrHandler);

	app.get("/verify/:id", (req, res) => {
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
				edited: !uploadServer.hasActiveToken(
					req.params.id,
					TokenType.EditToken,
				),
			});
		}
		return res
			.status(200)
			.send({ valid: false, uploaded: false, edited: false });
	});
	app.get("/file/:id", (req, res) => {
		if (!req.params.id || !uploadServer.fileTokenMap.has(req.params.id)) {
			if (
				uploadServer.hasActiveToken(req.params.id, TokenType.EditToken)
			) {
				const file = uploadServer.editTokenFilenameMap.get(
					req.params.id,
				);
				if (!file) {
					return res.status(404).send("Not Found");
				}
				return res.sendFile(file.filename);
			}
			return res.status(404).send("Not Found");
		}
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
	app.post("/upload/:id", upload.single("upload"), (req, res) => {
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
	app.post("/edit/:id", jsonParser, async (req, res) => {
		if (
			!req.params.id ||
			!uploadServer.hasActiveToken(req.params.id, TokenType.EditToken)
		) {
			return res.status(403).send("Forbidden");
		}
		const parsed = UploadRequestSchema.safeParse(req.body);
		if (!req.body || !parsed.success) {
			return res.status(400).send("Invalid request body");
		}
		const file = uploadServer.editTokenFilenameMap.get(req.params.id);
		/**
		 * @description with dot
		 */
		const extension = file?.filename.substring(
			file.filename.lastIndexOf("."),
		);
		const action = parsed.data.action;
		if (!file || !extension) {
			return res
				.status(500)
				.send("Unexpected missing filename or extension");
		}
		switch (action) {
			case "edit": {
				const { editedContent, createCopy } = parsed.data;
				const rawFilename = file.filename.substring(
					0,
					file.filename.lastIndexOf("."),
				);
				console.log(`Received edited file: ${file}`);
				if (createCopy) {
					await copyFile(
						file.filename,
						`${rawFilename}_edited${extension}`,
					);
				}
				await writeFile(file.filename, editedContent, "utf-8").catch(
					(err) => {
						console.error("Error writing edited file:", err);
					},
				);
				if (uploadServer.useEditToken(req.params.id)) {
					return res.status(200).send("File edited successfully");
				} else {
					return res
						.status(500)
						.send("Unexpected token usage failed");
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

export interface FileBuffer {
	buffer: Buffer;
	filename: string;
}
export interface File {
	filename: string;
	containingFolderPath: string;
}

export enum TokenType {
	FileToken = "file",
	EditToken = "edit",
}

export class UploadServer extends EventEmitter {
	port: number;
	hosting: boolean;
	hostAddress: string;
	activeTokens: Set<string>;
	allTokens: Set<string>;
	tokenTypeMap: Map<string, TokenType>;
	fileTokenMap: Map<string, FileBuffer>;
	editTokenFilenameMap: Map<string, File>;
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
		this.editTokenFilenameMap = new Map();

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
	hasActiveToken(token: string | null | undefined, type: TokenType | null) {
		if (token === null || token === undefined) return false;
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

	createEditToken(file: File) {
		const token = this.createToken(TokenType.EditToken);
		this.editTokenFilenameMap.set(token, file);
		return token;
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

	awaitFileToken(token: string, timeout = 1000 * 60 * 5) {
		if (!this.hasActiveToken(token, TokenType.FileToken))
			return Promise.reject(new Error("Invalid token"));
		return new Promise<FileBuffer>((resolve, reject) => {
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
			const tid = setTimeout(() => {
				this.off("tokenUsed", listener);
				this.off("tokenDeleted", listener);
				this.checkTokens();
				reject(new Error("Timeout waiting for token usage"));
			}, timeout);
		});
	}

	awaitEditToken(token: string, timeout = 1000 * 60 * 5) {
		if (!this.hasActiveToken(token, TokenType.EditToken))
			return Promise.reject(new Error("Invalid token"));
		return new Promise<boolean>((resolve) => {
			const listener = (usedToken: string) => {
				if (usedToken === token) {
					this.off("tokenUsed", listener);
					this.off("tokenDeleted", listener);
					clearTimeout(tid);
					return resolve(true);
				}
			};
			this.on("tokenUsed", listener);
			this.on("tokenDeleted", listener);
			const tid = setTimeout(() => {
				this.off("tokenUsed", listener);
				this.off("tokenDeleted", listener);
				this.editTokenFilenameMap.delete(token);
				this.checkTokens();
				resolve(false);
			}, timeout);
		});
	}

	useEditToken(token: string) {
		if (this.hasActiveToken(token, TokenType.EditToken)) {
			this.activeTokens.delete(token);
			this.editTokenFilenameMap.delete(token);
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

	disposeToken(token: string) {
		this.activeTokens.delete(token);
		this.fileTokenMap.delete(token);
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

export const uploadserver = new UploadServer();
