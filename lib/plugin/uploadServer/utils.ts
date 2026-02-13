import { randomUUIDv7 } from "bun";
import z from "zod";

export interface FileBuffer {
	buffer: Buffer;
	filename: string;
}
export interface BaseFile {
	filename: string;
	containingFolderPath: string;
}
export interface EditFile extends BaseFile {
	sessionId: string;
}

export interface Diff {
	content: string;
	token: string;
}

export enum TokenType {
	FileToken = "file",
	EditToken = "edit",
	EditForceToken = "editforce",
	EditDiffToken = "editdiff",
	ViewToken = "view",
}
export type EditTokenType =
	| TokenType.EditDiffToken
	| TokenType.EditForceToken
	| TokenType.EditToken;

export function generateSessionId() {
	return randomUUIDv7();
}

export interface CreateEditTokenParams {
	file: BaseFile;
	type: EditTokenType;
	sessionId?: string;
	bypassFileExistCheck?: boolean;
}
export const UploadRequestSchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("edit"),
		editedContent: z.string(),
		isNbt: z.boolean().optional().default(false),
		isBedrock: z.boolean().optional().default(false),
		compressionMethod: z.enum(["gzip", "zlib"]).optional(),
	}),
	z.object({
		action: z.literal("rename"),
		newFilename: z.string(),
	}),
	z.object({
		action: z.literal("delete"),
	}),
	z.object({
		action: z.literal("fetch"),
		parseNbt: z.boolean().optional(),
		isBedrock: z.boolean().optional().default(false),
	}),
	z.object({
		action: z.literal("metadata"),
	}),
]);
