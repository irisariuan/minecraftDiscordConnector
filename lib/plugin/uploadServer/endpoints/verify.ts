import type { Request, Response } from "express";
import type { UploadServer } from "../../uploadServer";
import { TokenType } from "../utils";

export function setupVerifyEndpoint(uploadServer: UploadServer) {
	return (req: Request, res: Response) => {
		if (!req.params.id) {
			return res.status(403).send("Forbidden");
		}
		if (uploadServer.token.hasActiveToken(req.params.id, null)) {
			return res.status(200).send({
				valid: true,
				uploaded: !uploadServer.token.hasActiveToken(
					req.params.id,
					TokenType.FileToken,
				),
				edited: !uploadServer.token.hasActiveToken(
					req.params.id,
					[
						TokenType.EditToken,
						TokenType.EditDiffToken,
						TokenType.EditForceToken,
					],
				),
			});
		}
		return res
			.status(200)
			.send({ valid: false, uploaded: false, edited: false });
	};
}
