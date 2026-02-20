import type { Request, Response } from "express";
import { existsSync } from "fs";
import { readFile, rename, writeFile } from "fs/promises";
import type { UploadServer } from "../../uploadServer";
import { safeJoin } from "../../../utils";
import { isNbtExtension, TokenType, UploadRequestSchema } from "../utils";
import { parseNBT, serializeNBT } from "../../../sharedLibrary";
import { stringify, parse } from "json-bigint";
import { TreeTagContainerType, type TreeTag } from "../../../treeView/types";

/**
 * GET /api/file/:id
 *
 * Serves two token types:
 *   - FileToken  → streams the raw in-memory buffer as a file download
 *   - ViewToken  → returns file content (plain-text or parsed NBT JSON) for read-only viewing
 */
export function setupFileGetEndpoint(uploadServer: UploadServer) {
	return async (req: Request, res: Response) => {
		if (!req.params.id) return res.status(404).send("Not Found");

		// FileToken: raw buffer download
		if (uploadServer.token.hasFileToken(req.params.id)) {
			const file = uploadServer.token.getFileToken(req.params.id);
			if (!file) return res.status(404).send("Not Found");
			res.setHeader(
				"Content-Disposition",
				`attachment; filename="${file.filename}"`,
			);
			res.setHeader("Content-Type", "application/octet-stream");
			return res.status(200).send(file.buffer);
		}

		// ViewToken: read-only file content
		if (
			uploadServer.token.hasActiveToken(req.params.id, [
				TokenType.ViewToken,
			])
		) {
			const file = uploadServer.token.getEditToken(req.params.id);
			if (!file) return res.status(404).send("File not found");
			const isBedrock = req.query.isBedrock === "true";
			const raw = req.query.raw === "true";
			const extension = file.filename.substring(
				file.filename.lastIndexOf("."),
			);
			const parseNbt =
				isNbtExtension(extension) || req.query.parseNbt === "true";

			try {
				const filePath = safeJoin(
					file.containingFolderPath,
					file.filename,
				);

				if (raw) {
					return res.status(200).sendFile(filePath);
				}

				if (parseNbt) {
					const rawContent = await readFile(filePath);
					const parsedNbtData = parseNBT(rawContent, isBedrock);
					return res.status(200).send(
						stringify({
							content: parsedNbtData,
							filename: file.filename,
							isNbt: true,
						}),
					);
				}

				const content = await readFile(filePath, "utf-8");
				return res.status(200).json({
					filename: file.filename,
					content,
					isNbt: false,
				});
			} catch (err) {
				console.error("Error reading file:", err);
				return res.status(500).send("Error reading file");
			}
		}

		return res.status(404).send("Not Found");
	};
}

/**
 * POST /api/file/:id
 *
 * Handles all edit-token actions: metadata, fetch, edit, rename, delete.
 * Requires an active EditToken, EditForceToken, or EditDiffToken.
 */
export function setupFilePostEndpoint(uploadServer: UploadServer) {
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
		 * @description includes the leading dot, e.g. ".dat"
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
					isNBT: isNbtExtension(extension),
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

				// Diff token: must be checked first so the diff+NBT branch is reachable
				if (
					uploadServer.token.getTokenType(req.params.id) ===
					TokenType.EditDiffToken
				) {
					const diff = uploadServer.token.getDiff(file.sessionId);

					if (diff && parsed.data.parseNbt) {
						// Diff + NBT: return both original and edited trees
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
						// Diff + plain text: return both original and edited strings
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
					}

					// No diff exists yet — expire the token and signal the client
					uploadServer.token.useEditToken(req.params.id);
					return res.status(404).send("No diff content available");
				}

				// Non-diff: NBT parse requested
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

				// Non-diff, plain file
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
							// editedContent is a JSON-stringified TreeTag produced
							// by the client (json-bigint stringify). We parse it
							// back with json-bigint so BigInt long values survive,
							// then re-serialize to binary NBT.
							let parsedNbtTag: TreeTag<
								| TreeTagContainerType.Compound
								| TreeTagContainerType.List
							>;
							try {
								const decoded = parse(
									editedContent,
								) as TreeTag<TreeTagContainerType>;
								if (
									decoded.type !==
										TreeTagContainerType.Compound &&
									decoded.type !== TreeTagContainerType.List
								) {
									return res
										.status(400)
										.send(
											"Invalid NBT content: root must be Compound or List",
										);
								}
								parsedNbtTag = decoded as TreeTag<
									| TreeTagContainerType.Compound
									| TreeTagContainerType.List
								>;
							} catch {
								return res
									.status(400)
									.send(
										"Invalid NBT content: failed to parse JSON tree",
									);
							}

							const finalBuffer = serializeNBT(
								parsedNbtTag,
								parsed.data.compressionMethod,
							);

							if (
								!finalBuffer ||
								Buffer.isBuffer(finalBuffer.buffer)
							) {
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
										"Error writing edited NBT file:",
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

						// Plain-text edit
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
