import { createWriteStream } from "fs";
import { Entry, fromBuffer } from "yauzl";
import { mkdir, exists, writeFile } from "fs/promises";
import { safeJoin } from "../utils";
import type { FileBuffer } from "./uploadServer";

export async function copyLocalPluginFileToServer(
	serverDir: string,
	file: FileBuffer,
) {
	console.log(
		`Copying local plugin file ${file.filename} to server plugins folder...`,
	);
	if (file.filename.endsWith(".zip")) {
		let buffer = file.buffer;
		try {
			await unzipTempPluginFile(serverDir, buffer, {
				acceptedExtensions: [".jar", ".yaml", ".yml", ".conf"],
			});
			return file.filename;
		} catch {
			return null;
		}
	}
	const path = safeJoin(serverDir, "plugins", file.filename);
	await writeFile(path, file.buffer);
	return file.filename;
}

export async function downloadWebPluginFileToLocal(
	url: string,
	serverDir: string,
	filename?: string,
) {
	const res = await fetch(url);
	if (!res.ok || !res.body) {
		return null;
	}
	console.log(
		`Downloading plugin file from ${url} to server plugins folder...`,
	);
	let finalFilename = filename;
	if (!finalFilename) {
		const contentDisposition = res.headers.get("content-disposition");
		const result = contentDisposition?.match(/filename="([^"]+)"/);
		if (result) {
			finalFilename = result[1];
		}
		console.log(
			`No filename provided, extracted from content-disposition: ${finalFilename}`,
		);
	}
	finalFilename = finalFilename ?? `plugin-${Date.now()}.jar`;

	if (finalFilename.endsWith(".zip")) {
		let buffer = Buffer.alloc(0);
		try {
			for await (const chunk of res.body) {
				buffer = Buffer.concat([buffer, chunk]);
			}
			await unzipTempPluginFile(serverDir, buffer, {
				acceptedExtensions: [".jar", ".yaml", ".yml", ".conf"],
			});
			return finalFilename;
		} catch {
			return null;
		}
	}

	const stream = createWriteStream(
		safeJoin(serverDir, "plugins", finalFilename),
	);
	try {
		for await (const chunk of res.body) {
			stream.write(chunk);
		}
		stream.close();
		return finalFilename;
	} catch {
		stream.destroy();
		return null;
	}
}

interface UnzipOptions {
	acceptedExtensions?: string[];
	maxEntries?: number;
}

export async function peekWebPluginFileZip(url: string) {
	const res = await fetch(url);
	if (!res.ok || !res.body) {
		return null;
	}
	const buffer = await res.arrayBuffer();
	return await peekZipEntries(Buffer.from(buffer));
}

export function peekZipEntries(buffer: Buffer) {
	const entries: string[] = [];
	return new Promise<string[]>((r) => {
		fromBuffer(buffer, { lazyEntries: true }, (err, zipFile) => {
			if (err) throw err;
			zipFile.readEntry();
			zipFile.on("entry", (entry: Entry) => {
				if (/\/$/.test(entry.fileName)) {
					return zipFile.readEntry();
				}
				entries.push(entry.fileName);
				zipFile.readEntry();
			});
			zipFile.on("end", () => {
				r(entries);
			});
		});
	});
}

export async function unzipTempPluginFile(
	serverDir: string,
	buffer: Buffer,
	options?: UnzipOptions,
) {
	let entryCount = 0;
	fromBuffer(buffer, { lazyEntries: true }, (err, zipFile) => {
		if (err) throw err;
		zipFile.readEntry();
		zipFile.on("entry", async (entry: Entry) => {
			if (/\/$/.test(entry.fileName)) {
				// Directory file names end with '/'.
				// Note that entries for directories themselves are optional.
				// An entry's fileName implicitly requires its parent directories to exist.
				zipFile.readEntry();
			} else {
				// file entry
				if (
					options?.acceptedExtensions &&
					!options.acceptedExtensions.some((ext) =>
						entry.fileName.endsWith(ext),
					)
				) {
					zipFile.readEntry();
					return;
				}
				entryCount++;
				if (options?.maxEntries && entryCount > options.maxEntries) {
					zipFile.close();
					return;
				}
				const parentEntryFolder = entry.fileName
					.split("/")
					.slice(0, -1)
					.join("/");

				if (
					!(await exists(
						safeJoin(serverDir, "plugins", parentEntryFolder),
					))
				) {
					console.log(
						`Creating parent folder ${parentEntryFolder} for entry ${entry.fileName}`,
					);
					await mkdir(
						safeJoin(serverDir, "plugins", parentEntryFolder),
						{
							recursive: true,
						},
					);
				}

				zipFile.openReadStream(entry, async (err, readStream) => {
					if (err) throw err;
					if (
						!(await exists(
							safeJoin(serverDir, "plugins", parentEntryFolder),
						))
					) {
						console.warn(
							`Parent folder ${parentEntryFolder} does not exist, skipping entry ${entry.fileName}`,
						);
						return zipFile.readEntry();
					}
					readStream.on("end", function () {
						zipFile.readEntry();
					});
					readStream.pipe(
						createWriteStream(
							safeJoin(serverDir, "plugins", entry.fileName),
						),
					);
				});
			}
		});
	});
}
