import { exists, glob, mkdir } from "node:fs/promises";
import { getNextTimestamp } from "../api";

export default function run() {
	console.log("Running daily scripts...");
	setTimeout(
		() => {
			async function func() {
				if (!(await exists(`${process.cwd()}/scripts`))) {
					await mkdir(`${process.cwd()}/scripts`);
					console.log(
						"Created scripts directory. Place your daily scripts there.",
					);
					return;
				}
				for await (const file of glob(
					`${process.cwd()}/scripts/*.ts`,
				)) {
					const name = file.split("/").pop()?.slice(0, -3);
					try {
						const module = await import(file);
						if (typeof module.default !== "function") {
							console.warn(
								`Skipping daily script ${name}: it has no default-exported function.`,
							);
							continue;
						}
						console.log(`Running daily script: ${name}`);
						await module.default();
					} catch (e) {
						console.error(
							`Error running daily script ${file}:`,
							e,
						);
					}
				}
			}
			void func();
			setInterval(func, 24 * 60 * 60 * 1000);
		},
		getNextTimestamp({
			hour: 0,
			minute: 0,
		}).getTime() - Date.now(),
	);
}
