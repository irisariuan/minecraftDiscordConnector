import { input } from "@inquirer/prompts";
import { createServer } from "../lib/db";
import { join, relative, resolve } from "path";
import { safeJoin } from "../lib/utils";
import { existsSync } from "fs";

const rawPath = await input({
	message: "Please enter server folder path",
	required: true,
	validate(value) {
		const realPath = resolve(value);
		return existsSync(realPath);
	},
});
const path = resolve(rawPath);
const rawPluginsPath = await input({
	message: "Please enter server plugins folder path",
	required: true,
	default: join(path, "plugins"),
	validate(value) {
		const relativePath = relative(path, value);
		return (
			relativePath.length > 0 &&
			!relativePath.startsWith("..") &&
			!relativePath.includes(":") &&
			existsSync(safeJoin(path, relativePath))
		);
	},
});
const pluginsPath = resolve(rawPluginsPath);

const rawApiPort = await input({
	message: "Please enter server API port (optional)",
	required: false,
});
const apiPort = rawApiPort ? parseInt(rawApiPort) : undefined;

const loaderType = await input({
	message: "Please enter loader type (e.g., fabric, forge, vanilla)",
	required: true,
});

const modType = await input({
	message: "Please enter mod type",
	required: true,
});

const version = await input({
	message: "Please enter Minecraft version",
	required: true,
});

const tag = await input({
	message: "Please enter server tag (optional)",
	required: false,
});

const rawPorts = await input({
	message: "Please enter server ports (comma-separated, default: 25565)",
	required: false,
	default: "25565",
	validate(value) {
		const ports = value
			.split(",")
			.map((p) => Number(p.trim()))
			.filter(
				(p) => !isNaN(p) && p > 0 && p < 65536 && Number.isInteger(p),
			);
		return ports.length > 0;
	},
});

const ports = rawPorts
	.split(",")
	.map((p) => Number(p.trim()))
	.filter((p) => !isNaN(p) && p > 0 && p < 65536 && Number.isInteger(p));

try {
	const server = await createServer({
		path,
		pluginPath: pluginsPath,
		port: ports,
		apiPort,
		loaderType,
		modType,
		version,
		tag: tag || null,
	});

	console.log(`Server created successfully with ID: ${server.id}`);
	console.log(`Path: ${server.path}`);
	console.log(`Plugin Path: ${server.pluginPath}`);
	console.log(`Ports: ${server.port.join(", ")}`);
	console.log(`Loader Type: ${server.loaderType}`);
	console.log(`Mod Type: ${server.modType}`);
	console.log(`Version: ${server.version}`);
	if (server.tag) console.log(`Tag: ${server.tag}`);
	if (server.apiPort) console.log(`API Port: ${server.apiPort}`);
} catch (error) {
	console.error("Error creating server:", error);
}
