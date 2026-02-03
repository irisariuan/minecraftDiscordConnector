import type { Request, Response } from "express";
import type { UploadServer } from "../../uploadServer";

export function setupFileEndpoint(uploadServer: UploadServer) {
	return (req: Request, res: Response) => {
		if (
			!req.params.id ||
			!uploadServer.token.hasFileToken(req.params.id)
		)
			return res.status(404).send("Not Found");

		const file = uploadServer.token.getFileToken(req.params.id);
		if (!file) {
			return res.status(404).send("Not Found");
		}
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="${file.filename}"`,
		);
		res.setHeader("Content-Type", "application/octet-stream");
		return res.status(200).send(file.buffer);
	};
}
