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
					console.log(
						`Running daily script: ${file.split("/").pop()?.slice(0, -3)}`,
					);
					import(file)
						.then((module) => module.default())
						.catch((e: Error) => {
							console.error(
								`Error running daily script ${file}:`,
								e,
							);
						});
				}
			}
			setInterval(func, 24 * 60 * 60 * 1000);
		},
		getNextTimestamp({
			hour: 0,
			minute: 0,
		}).getTime() - Date.now(),
	);
}
