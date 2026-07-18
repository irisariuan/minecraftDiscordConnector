import { input } from "@inquirer/prompts";
import { createServer } from "../lib/db";
import type { Prisma } from "../generated/prisma/client";
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
		port: ports,
		tag: tag ?? null,
		pluginId: "minecraft",
		runtimeVersion: version,
		config: {
			loaderType,
			modType,
			minecraftVersion: version,
			pluginDir: pluginsPath,
			apiPort,
		} as Prisma.InputJsonValue,
	});

	console.log(`Server created successfully with ID: ${server.id}`);
	console.log(`Path: ${server.path}`);
	console.log(`Ports: ${server.port.join(", ")}`);
	console.log(`Game Plugin: ${server.pluginId}`);
	console.log(`Runtime Version: ${server.runtimeVersion ?? "none"}`);
	if (server.tag) console.log(`Tag: ${server.tag}`);
} catch (error) {
	console.error("Error creating server:", error);
}
