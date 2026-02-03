import { writeFile } from "node:fs/promises";

export function buildInit(
	userAgent: string,
	contentType?: string,
	postData?: any,
): RequestInit {
	return {
		body: postData,
		method: postData ? "POST" : "GET",
		headers: {
			"User-Agent": userAgent,
			...(contentType ? { "Content-Type": contentType } : {}),
		},
	} satisfies RequestInit;
}
export async function downloadAndSave(url: string, filePath: string) {
	const res = await fetch(url);
	if (!res.ok) return null;
	const arrayBuf = await res.arrayBuffer();
	await writeFile(filePath, Buffer.from(arrayBuf));
}
