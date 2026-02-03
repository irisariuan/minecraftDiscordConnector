import type { Request, Response } from "express";
import type { UploadServer } from "../uploadServer";
import { TokenType, type FileBuffer } from "./utils";

export function setupUploadEndpoint(uploadServer: UploadServer) {
	return (req: Request, res: Response) => {
		if (
			!req.params.id ||
			!uploadServer.token.hasActiveToken(
				req.params.id,
				TokenType.FileToken,
			)
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
		if (uploadServer.token.useFileToken(req.params.id, file)) {
			return res.status(200).send("File uploaded successfully");
		} else {
			return res.status(500).send("Unexpected token usage failed");
		}
	};
}
