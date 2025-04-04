import { REST, Routes } from "discord.js";
import { loadCommands } from "../lib/commands";

if (!process.env.TOKEN || !process.env.CLIENT_ID) throw new Error("No token provided");

const commands = loadCommands()
const rest = new REST().setToken(process.env.TOKEN);
for (const command of commands) {
    console.log(`Registering command ${command.command.name}`);
    await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: [command.command.toJSON()] },
    );
    console.log(`Successfully registered command ${command.command.name}`);
}