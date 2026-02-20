import { existsSync } from "fs";
import { dlopen, toArrayBuffer } from "bun:ffi";
import { join } from "path";
import { parse, stringify } from "json-bigint";
import type {
	TreeTag,
	TreeTagContainerType,
	TreeTagType,
} from "./treeView/types";

const prefix = join(process.cwd(), "lib", "compiled");
export const sharedLibraryPath =
	process.platform === "win32"
		? join(prefix, "libnbt.dll")
		: process.platform === "darwin"
			? join(prefix, "libnbt.dylib")
			: join(prefix, "libnbt.so");
if (!existsSync(sharedLibraryPath)) {
	throw new Error(`Shared library not found at path: ${sharedLibraryPath}`);
}

const { symbols } = dlopen(sharedLibraryPath, {
	ParseNBT: { args: ["buffer", "int", "bool"], returns: "cstring" },
	SerializeNBT: {
		args: ["cstring", "cstring", "pointer"],
		returns: "cstring",
	},
	FreeMemory: { args: ["pointer"], returns: "void" },
});

export function parseNBTToString(
	data: Buffer,
	length: number,
	isBedrock: boolean,
): string {
	const result = symbols.ParseNBT(data, length, isBedrock);
	const resultString = result.toString();
	symbols.FreeMemory(result.ptr);
	return resultString;
}

export function parseNBT(data: Buffer, isBedrock: boolean) {
	try {
		const jsonString = parseNBTToString(data, data.length, isBedrock);
		return parse(jsonString) as TreeTag<TreeTagType>;
	} catch (e) {
		console.error(e);
		return null;
	}
}

export function serializeNBT(
	tag: TreeTag<TreeTagContainerType.Compound | TreeTagContainerType.List>,
	compressionMethod?: "gzip" | "zlib",
) {
	const jsonString = stringify(tag);
	return serializeNBTFromString(jsonString, compressionMethod);
}

export function serializeNBTFromString(
	json: string,
	compressionMethod: "gzip" | "zlib" | "" = "",
): { buffer: ArrayBuffer; size: number } | null {
	try {
		const jsonBuffer = Buffer.from(json);
		const compressionBuffer = Buffer.from(compressionMethod);
		const outLength = Buffer.alloc(4);
		const result = symbols.SerializeNBT(
			jsonBuffer,
			compressionBuffer,
			outLength,
		);
		const outSize = outLength.readInt32LE(0);
		if (outSize <= 0) return null;
		// slice to create copy
		const outBuffer = toArrayBuffer(result.ptr, 0, outSize).slice(0);
		// Free the memory allocated by the shared library function
		symbols.FreeMemory(result.ptr);
		return { buffer: outBuffer, size: outSize };
	} catch (e) {
		console.error("Error in serializeNBTFromString:", e);
		return null;
	}
}
