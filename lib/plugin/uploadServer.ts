import bodyParser from "body-parser";
import cors from "cors";
import "dotenv/config";
import express, { type Express } from "express";
import type { Server } from "http";
import multer from "multer";
import { handler as ssrHandler } from "../../webUi/dist/server/entry.mjs";
import { CORS_ORIGIN } from "../env";
import { safeJoin } from "../utils";
import { setupVerifyEndpoint } from "./uploadServer/verifyEndpoint";
import { setupFileEndpoint } from "./uploadServer/fileEndpoint";
import { setupUploadEndpoint } from "./uploadServer/uploadEndpoint";
import { setupEditEndpoint } from "./uploadServer/editEndpoint";
import { setupDeleteTokenEndpoint } from "./uploadServer/deleteTokenEndpoint";
import { TokenManager } from "./uploadServer/tokenManager";

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

export class UploadServer {
	port: number;
	hosting: boolean;
	hostAddress: string;
	autoHost: boolean;
	acceptedExtensions: string[];
	token: TokenManager;
	private app: Express;
	private server: Server | null;

	constructor(
		port = 6003,
		hostAddress = "0.0.0.0",
		extensions = [".jar", ".yaml", ".yml", ".conf", ".zip"],
	) {
		this.port = port;
		this.hosting = false;
		this.hostAddress = hostAddress;
		this.server = null;
		this.autoHost = true;
		this.acceptedExtensions = extensions;
		this.token = new TokenManager();

		// Set up token manager event listeners for auto-hosting
		this.token.on("tokenCreated", () => {
			if (this.autoHost) this.host();
		});

		this.token.on("tokenUsed", () => this.checkTokens());
		this.token.on("tokenDeleted", () => this.checkTokens());
		this.token.on("fileExpired", () => this.checkTokens());

		this.app = createUploadServer(this);
	}

	// Server hosting methods

	host() {
		if (this.hosting) return;
		this.server = this.app.listen(this.port, this.hostAddress, () => {
			this.hosting = true;
			console.log(
				`Upload server listening on http://${this.hostAddress}:${this.port}`,
			);
		});
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

	checkTokens() {
		if (
			this.token.getActiveTokenCount() === 0 &&
			this.token.getFileTokenCount() === 0 &&
			this.autoHost
		) {
			this.stopHost();
		}
	}

	cleanup(): void {
		this.token.cleanup();
		this.stopHost();
	}
}

export const uploadServer = new UploadServer();
