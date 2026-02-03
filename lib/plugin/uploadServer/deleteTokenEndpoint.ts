import type { Request, Response } from "express";
import type { UploadServer } from "../uploadServer";

export function setupDeleteTokenEndpoint(uploadServer: UploadServer) {
	return (req: Request, res: Response) => {
		const token = req.params.id;
		const dispose =
			req.query.dispose === "true" || req.body?.dispose === true;

		if (!token) {
			return res.status(400).send("Token ID is required");
		}

		// Check if token exists
		if (!uploadServer.token.hasToken(token)) {
			return res.status(404).send("Token not found");
		}

		// Check if token is still active
		const isActive = uploadServer.token.hasActiveToken(token, null);

		if (dispose) {
			// Dispose token (delete and free all associated resources)
			uploadServer.token.disposeToken(token);
			return res.status(200).send({
				success: true,
				message: "Token disposed successfully",
				wasActive: isActive,
			});
		} else {
			// Just deactivate the token without disposing resources
			if (isActive) {
				uploadServer.token.deactivateToken(token);
				return res.status(200).send({
					success: true,
					message: "Token deactivated successfully",
					wasActive: true,
				});
			} else {
				return res.status(200).send({
					success: true,
					message: "Token was already inactive",
					wasActive: false,
				});
			}
		}
	};
}
