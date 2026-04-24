import { glob } from "node:fs/promises";
import { getNextTimestamp } from "../../lib/utils";

export default function run() {
	console.log("Running daily scripts...");
	setTimeout(
		() => {
			async function func() {
				for await (const file of glob(
					`${process.cwd()}/scripts/*.ts`,
				)) {
					console.log(
						`Running daily script: ${file.split("/").pop()?.slice(0, -3)}`,
					);
					import(file).then((module) => module.default());
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
