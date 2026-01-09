import { safeJoin } from "./utils";

export function getAllPluginScriptPaths(): string[] {
	const glob = new Bun.Glob("plugins/**/*.script.ts");
	return Array.from(glob.scanSync(process.cwd()));
}
export async function runScripts(paths: string[], printResults = false) {
	for (const path of paths) {
		const loadedResult = await Promise.try(
			() =>
				import(safeJoin(process.cwd(), path)) as Promise<{
					default: () => unknown;
				}>,
		).catch((err) => {
			console.error(`Failed to run plugin script at ${path}:`, err);
		});
		if (!loadedResult) continue;
		try {
			const result = await loadedResult.default();
			if (printResults) {
				console.log(`Result of plugin script at ${path}:`, result);
			}
		} catch (err) {
			console.error(`Error executing plugin script at ${path}:`, err);
		}
	}
}
