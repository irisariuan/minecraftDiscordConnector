import type {
	ChatInputCommandInteraction,
	Client,
	MessageReaction,
	PartialMessageReaction,
	PartialUser,
	SlashCommandBuilder,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder,
	User,
} from "discord.js";
import type { Permission } from "./permission";
import { Server, ServerManager } from "./server";
import { safeJoin } from "./utils";

interface ExecuteParams {
	interaction: ChatInputCommandInteraction;
	serverManager: ServerManager;
	client: Client;
}

interface ExecuteParamsWithServer extends ExecuteParams {
	server: Server;
}

interface ExecuteReactionParams {
	interaction: MessageReaction | PartialMessageReaction;
	user: User | PartialUser;
	client: Client;
}

export interface CommandFeatures {
	requireStartedServer: boolean;
	requireStoppedServer: boolean;
	suspendable: boolean;
}

export interface CommandFile<RequireServer extends boolean> {
	command:
		| SlashCommandBuilder
		| SlashCommandOptionsOnlyBuilder
		| SlashCommandSubcommandsOnlyBuilder;
	requireServer: RequireServer;
	features?: Partial<CommandFeatures>;
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
	const glob = new Bun.Glob("commands/*.ts");
	const commands: CommandFile<boolean>[] = [];

	for (const path of glob.scanSync(process.cwd())) {
		const commandFile = (await import(safeJoin(process.cwd(), path)))
			.default;
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
