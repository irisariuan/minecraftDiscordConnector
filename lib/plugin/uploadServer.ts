import express, { type Express } from "express";
import multer from "multer";
import { randomBytes } from "crypto";
import EventEmitter from "events";
import type { Server } from "http";
import cors from "cors";
import { handler as ssrHandler } from "../../webUi/dist/server/entry.mjs";

function createUploadServer(manager: UploadServerManager) {
	const app = express();
	const upload = multer({
		limits: {
			fileSize: 1024 * 1024 * 1024, // 1GB limit
		},
	});

	app.use(cors({ origin: "*" }));
	app.use("/", express.static("../../webUi/dist/client/"));
	app.use(ssrHandler);

	app.get("/verify/:id", (req, res) => {
		if (!req.params.id) {
			return res.status(403).send("Forbidden");
		}
		if (manager.hasActiveToken(req.params.id)) {
			return res.status(200).send({
				valid: true,
				uploaded: !manager.hasActiveToken(req.params.id),
			});
		}
		return res.status(200).send({ valid: false, uploaded: false });
	});
	app.post("/upload/:id", upload.single("upload"), (req, res) => {
		if (!req.params.id || !manager.hasActiveToken(req.params.id)) {
			return res.status(403).send("Forbidden");
		}
		// Handle file upload here
		if (!req.file) {
			return res.status(400).send("No file uploaded");
		}
		if (
			!manager.acceptedExtensions.some((v) =>
				req.file?.originalname.endsWith(v),
			)
		) {
			return res
				.status(400)
				.send(
					`Invalid file type. Accepted types: ${manager.acceptedExtensions.join(", ")}`,
				);
		}
		console.log(`Received file: ${req.file?.originalname}`);
		const file: File = {
			buffer: req.file.buffer,
			filename: req.file.originalname,
		};
		if (manager.useToken(req.params.id, file)) {
			return res.status(200).send("File uploaded successfully");
		} else {
			return res.status(500).send("Unexpected token usage failed");
		}
	});
	return app;
}

interface File {
	buffer: Buffer;
	filename: string;
}

export class UploadServerManager extends EventEmitter {
	port: number;
	hosting: boolean;
	hostAddress: string;
	activeTokens: Set<string>;
	allTokens: Set<string>;
	autoHost: boolean;
	acceptedExtensions: string[];
	private app: Express;
	private server: Server | null;

	constructor(
		port = 6003,
		hostAddress = "0.0.0.0",
		extensions = [".jar", ".yaml", ".yml", ".conf"],
	) {
		super();
		this.port = port;
		this.hosting = false;
		this.hostAddress = hostAddress;
		this.activeTokens = new Set();
		this.allTokens = new Set();
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
	hasActiveToken(token: string | null | undefined) {
		if (token === null || token === undefined) return false;
		return this.activeTokens.has(token);
	}
	hasToken(token: string | null | undefined) {
		if (token === null || token === undefined) return false;
		return this.allTokens.has(token);
	}

	createToken() {
		const token = randomBytes(16).toString("hex");
		this.activeTokens.add(token);
		this.allTokens.add(token);
		if (this.autoHost) this.host();
		return token;
	}
	awaitToken(token: string, timeout = 1000 * 60 * 5) {
		if (!this.hasActiveToken(token)) return Promise.resolve();
		return new Promise<File>((resolve, reject) => {
			const listener = (usedToken: string, file: File) => {
				if (usedToken === token) {
					this.off("tokenUsed", listener);
					clearTimeout(tid);
					resolve(file);
				}
			};
			this.on("tokenUsed", listener);
			const tid = setTimeout(() => {
				this.off("tokenUsed", listener);
				reject(new Error("Timeout waiting for token usage"));
			}, timeout);
		});
	}

	useToken(token: string, file: File) {
		if (this.hasActiveToken(token)) {
			this.activeTokens.delete(token);
			this.emit("tokenUsed", token, file);
			this.checkTokens();
			return true;
		}
		return false;
	}

	checkTokens() {
		if (this.activeTokens.size === 0 && this.autoHost) {
			this.stopHost();
		}
	}

	stopHost() {
		if (!this.hosting) return;
		this.server?.close();
		this.hosting = false;
		this.server = null;
	}

	on(event: "tokenUsed", listener: (token: string, file: File) => unknown) {
		return super.on(event, listener);
	}
}

export const uploadServerManager = new UploadServerManager();
