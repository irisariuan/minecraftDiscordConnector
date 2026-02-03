import type { Request, Response } from "express";
import { readFile } from "fs/promises";
import type { UploadServer } from "../../uploadServer";
import { safeJoin } from "../../../utils";
import { TokenType } from "../utils";

export function setupViewEndpoint(uploadServer: UploadServer) {
	return async (req: Request, res: Response) => {
		if (
			!req.params.id ||
			!uploadServer.token.hasActiveToken(req.params.id, [
				TokenType.ViewToken,
			])
		) {
			return res.status(401).send("Invalid or expired token");
		}

		const file = uploadServer.token.getEditToken(req.params.id);
		if (!file) {
			return res.status(404).send("File not found");
		}

		try {
			const filePath = safeJoin(
				file.containingFolderPath,
				file.filename,
			);
			const content = await readFile(filePath, "utf-8");

			// Return file content as JSON with metadata
			return res.status(200).json({
				filename: file.filename,
				content: content,
				readonly: true,
			});
		} catch (err) {
			console.error("Error reading file:", err);
			return res.status(500).send("Error reading file");
		}
	};
}
