import { safeJoin } from "../../utils";

export interface ServerConfig {
	modType: string;
	serverDir: string;
	minecraftVersion: string;
	loaderType: string;
	pluginDir: string;
	tag: string | null;
	port: number[];
	apiPort: number | null;
}

export const serverConfig: ServerConfig = {
	modType: process.env.MOD_TYPE!,
	serverDir: process.env.SERVER_DIR!,
	minecraftVersion: process.env.MINECRAFT_VERSION!,
	loaderType: process.env.LOADER_TYPE!,
	pluginDir: safeJoin(process.env.SERVER_DIR!, "plugins"),
	tag: process.env.SERVER_TAG || null,
	port: [parseInt(process.env.SERVER_PORT || "25565")],
	apiPort: parseInt(process.env.SERVER_API_PORT ?? "6001"),
};
