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

export interface CommandFile {
	command: SlashCommandBuilder;
	execute: (
		interaction: ChatInputCommandInteraction,
		client: Client,
	) => unknown | Promise<unknown>;
	executeReaction?: (
		interaction: MessageReaction | PartialMessageReaction,
		user: User | PartialUser,
		client: Client,
	) => unknown | Promise<unknown>;
	permissions?: number[];
}

export async function loadCommands() {
	const glob = new Bun.Glob("commands/**/*.ts");
	const commands: CommandFile[] = [];

	for (const path of glob.scanSync(process.cwd())) {
		const commandFile = (await import(join(process.cwd(), path))).default;
		if (!commandFile) continue;
		commands.push(commandFile);
	}

	return commands;
}
