import type { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import { join } from 'node:path'

export interface CommandFile {
    command: SlashCommandBuilder
    execute: (interaction: ChatInputCommandInteraction, client: Client) => void | Promise<void>
}

export function loadCommands() {
    const glob = new Bun.Glob("commands/**/*.ts")
    const commands: CommandFile[] = [];

    for (const path of glob.scanSync(process.cwd())) {
        const commandFile = require(join(process.cwd(), path)).default;
        if (!commandFile) continue
        commands.push(commandFile);
    }

    return commands;
}