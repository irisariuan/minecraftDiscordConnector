import type {
	ChatInputCommandInteraction,
	Client,
	MessageReaction,
	PartialMessageReaction,
	PartialUser,
	SlashCommandBuilder,
	User,
} from "discord.js";
import { join } from "node:path";
import type { Permission } from "./permission";
import { Server, ServerManager } from "./server";

interface ExecuteParams {
	interaction: ChatInputCommandInteraction;
	client: Client;
}

interface ExecuteParamsWithServer extends ExecuteParams {
	server: Server;
	serverManager: ServerManager;
}

interface ExecuteReactionParams {
	interaction: MessageReaction | PartialMessageReaction;
	user: User | PartialUser;
	client: Client;
}

export interface CommandFile<RequireServer extends boolean> {
	command: SlashCommandBuilder;
	requireServer: RequireServer;
	execute: (
		params: RequireServer extends true
			? ExecuteParamsWithServer
			: ExecuteParams,
	) => unknown | Promise<unknown>;
	executeReaction?: (
		params: ExecuteReactionParams,
	) => unknown | Promise<unknown>;
	permissions?: Permission;
	ephemeral?: boolean;
}

export async function loadCommands() {
	const glob = new Bun.Glob("commands/**/*.ts");
	const commands: CommandFile<boolean>[] = [];

	for (const path of glob.scanSync(process.cwd())) {
		const commandFile = (await import(join(process.cwd(), path))).default;
		if (!commandFile) continue;
		commands.push(commandFile);
	}

	return commands;
}

export function doNotRequireServer(
	commandFile: CommandFile<boolean>,
): commandFile is CommandFile<false> {
	return commandFile.requireServer === false;
}
