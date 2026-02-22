import {
	REST,
	Routes,
	type AutocompleteInteraction,
	type ChatInputCommandInteraction,
	type Client,
	type MessageReaction,
	type PartialMessageReaction,
	type PartialUser,
	type SlashCommandBuilder,
	type SlashCommandOptionsOnlyBuilder,
	type SlashCommandSubcommandsOnlyBuilder,
	type User,
} from "discord.js";
import type { Permission } from "./permission";
import { Server, ServerManager, type ServerGameType } from "./server";
import { safeJoin } from "./utils";
import { CLIENT_ID, TOKEN } from "./env";

type AcceptedInteractions =
	| AutocompleteInteraction
	| ChatInputCommandInteraction;

interface ExecuteParams<Interaction extends AcceptedInteractions> {
	interaction: Interaction;
	serverManager: ServerManager;
	client: Client;
}

interface ExecuteParamsWithServer<
	Interaction extends AcceptedInteractions,
> extends ExecuteParams<Interaction> {
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
	unsuspendable: boolean;
	supportedPlatforms: ServerGameType[];
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
			? ExecuteParamsWithServer<ChatInputCommandInteraction>
			: ExecuteParams<ChatInputCommandInteraction>,
	) => unknown;
	executeReaction?: (params: ExecuteReactionParams) => unknown;
	autoComplete?: (params: ExecuteParams<AutocompleteInteraction>) => unknown;
	permissions?: Permission;
	ephemeral?: RequireServer extends true ? boolean : never;
}
export interface LoadedCommandFile<
	RequireServer extends boolean,
> extends CommandFile<RequireServer> {
	isPlugin: boolean;
}

export async function loadCommands(loadPlugins = true) {
	const glob = new Bun.Glob("commands/*.ts");
	const paths = Array.from(glob.scanSync(process.cwd()));
	const pluginPaths: string[] = [];
	if (loadPlugins) {
		const pluginGlob = new Bun.Glob("plugins/**/*.command.ts");
		pluginPaths.push(...Array.from(pluginGlob.scanSync(process.cwd())));
	}
	const commands: LoadedCommandFile<boolean>[] = [];

	for (const path of paths) {
		const commandFile = (
			await Promise.try(
				() =>
					import(safeJoin(process.cwd(), path)) as Promise<{
						default: CommandFile<boolean>;
					}>,
			).catch(() => null)
		)?.default;
		if (!commandFile) continue;
		commands.push({ ...commandFile, isPlugin: false });
	}

	for (const path of pluginPaths) {
		const commandFile = (
			await Promise.try(
				() =>
					import(safeJoin(process.cwd(), path)) as Promise<{
						default: CommandFile<boolean>;
					}>,
			).catch(() => null)
		)?.default;
		if (!commandFile) continue;
		commands.push({ ...commandFile, isPlugin: true });
	}

	return commands;
}

export function doNotRequireServer(
	commandFile: CommandFile<boolean>,
): commandFile is CommandFile<false> {
	return commandFile.requireServer === false;
}

export async function registerCommands(commandFiles: CommandFile<boolean>[]) {
	const rest = new REST().setToken(TOKEN);
	try {
		await rest.put(Routes.applicationCommands(CLIENT_ID), {
			body: commandFiles.map((file) => file.command),
		});
		return true;
	} catch {
		return false;
	}
}

export async function getAllRegisteredCommandNames() {
	const rest = new REST().setToken(TOKEN);
	try {
		const result = (await rest.get(
			Routes.applicationCommands(CLIENT_ID),
		)) as { name: string }[];
		return result.map((command) => command.name);
	} catch {
		return null;
	}
}
