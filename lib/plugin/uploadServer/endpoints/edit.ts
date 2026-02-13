import type { Request, Response } from "express";
import { existsSync } from "fs";
import { readFile, rename, writeFile } from "fs/promises";
import type { UploadServer } from "../../uploadServer";
import { safeJoin } from "../../../utils";
import { TokenType, UploadRequestSchema } from "../utils";
import { parseNBT, serializeNBT } from "../../../sharedLibrary";
import { stringify, parse } from "json-bigint";
import { TreeTagContainerType, type TreeTag } from "../../../treeView/types";

export function setupEditEndpoint(uploadServer: UploadServer) {
	return async (req: Request, res: Response) => {
		if (
			!req.params.id ||
			!uploadServer.token.hasActiveToken(req.params.id, [
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
		const file = uploadServer.token.getEditToken(req.params.id);
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
						uploadServer.token.getTokenType(req.params.id) ===
						TokenType.EditDiffToken,
					isForce:
						uploadServer.token.getTokenType(req.params.id) ===
						TokenType.EditForceToken,
					isNBT: extension === ".dat",
				});
			}
			case "fetch": {
				const filepath = safeJoin(
					file.containingFolderPath,
					file.filename,
				);
				if (!existsSync(filepath))
					return res
						.status(500)
						.send("File not found or not readable");
				if (parsed.data.parseNbt) {
					const rawContent = await readFile(filepath).catch(
						() => null,
					);
					if (!rawContent)
						return res
							.status(500)
							.send("File not found or not readable");
					const parsedNbtData = parseNBT(
						rawContent,
						parsed.data.isBedrock,
					);
					return res.status(200).send(
						stringify({
							parsed: parsedNbtData,
							raw: rawContent.toString("hex"),
						}),
					);
				}
				if (
					uploadServer.token.getTokenType(req.params.id) ===
					TokenType.EditDiffToken
				) {
					const diff = uploadServer.token.getDiff(file.sessionId);
					if (diff && parsed.data.parseNbt) {
						const rawContent = await readFile(filepath).catch(
							() => null,
						);
						if (!rawContent)
							return res
								.status(500)
								.send("File not found or not readable");
						const parsedNbtData = parseNBT(
							rawContent,
							parsed.data.isBedrock,
						);
						return res.status(200).send(
							stringify({
								edited: parse(diff.content),
								raw: parsedNbtData,
								rawBinary: rawContent.toString("hex"),
							}),
						);
					}
					if (diff) {
						const rawContent = await readFile(
							filepath,
							"utf-8",
						).catch(() => "");
						return res.status(200).send(
							JSON.stringify({
								edited: diff.content,
								raw: rawContent,
							}),
						);
					} else {
						uploadServer.token.useEditToken(req.params.id);
						return res
							.status(404)
							.send("No diff content available");
					}
				}
				return res.sendFile(filepath);
			}
			case "edit": {
				const { editedContent } = parsed.data;
				switch (uploadServer.token.getTokenType(req.params.id)) {
					case TokenType.EditToken: {
						uploadServer.token.useEditToken(req.params.id);
						uploadServer.token.newDiff(
							file.sessionId,
							editedContent,
						);
						return res
							.status(200)
							.send("Uploaded content received");
					}
					case TokenType.EditForceToken:
					case TokenType.EditDiffToken: {
						console.log(`Received edited file: ${file.filename}`);
						const tokenId = req.params.id;

						if (parsed.data.isNbt) {
							const parsedNbtTag = parseNBT(
								Buffer.from(editedContent, "utf-8"),
								parsed.data.isBedrock,
							);
							if (
								!parsedNbtTag ||
								!(
									parsedNbtTag.type ===
										TreeTagContainerType.Compound ||
									parsedNbtTag.type ===
										TreeTagContainerType.List
								)
							) {
								return res
									.status(400)
									.send("Invalid NBT content");
							}
							const finalBuffer = serializeNBT(
								parsedNbtTag as TreeTag<
									| TreeTagContainerType.Compound
									| TreeTagContainerType.List
								>,
								parsed.data.compressionMethod,
							);
							if (!finalBuffer) {
								return res
									.status(400)
									.send("Failed to serialize NBT content");
							}
							return await writeFile(
								safeJoin(
									file.containingFolderPath,
									file.filename,
								),
								Buffer.from(
									finalBuffer.buffer,
									0,
									finalBuffer.size,
								),
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
									if (tokenId) {
										uploadServer.token.useEditToken(
											tokenId,
										);
										uploadServer.token.disposeToken(
											tokenId,
										);
									}
									return res
										.status(200)
										.send("File edited successfully");
								});
						}

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
								if (tokenId) {
									uploadServer.token.useEditToken(tokenId);
									uploadServer.token.disposeToken(tokenId);
								}
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
	};
}
