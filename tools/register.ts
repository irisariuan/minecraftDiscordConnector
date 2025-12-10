import { REST, Routes } from "discord.js";
import { loadCommands } from "../lib/commandFile";

if (!process.env.TOKEN || !process.env.CLIENT_ID)
	throw new Error("No token provided");

const commands = await loadCommands();
const rest = new REST().setToken(process.env.TOKEN);
console.log(`Registering commands, total ${commands.length}`);
await rest
	.put(Routes.applicationCommands(process.env.CLIENT_ID), {
		body: commands.map((v) => v.command.toJSON()),
	})
	.then(() => {
		console.log(
			`Successfully registered commands, total ${commands.length}`,
		);
	})
	.catch((err) => {
		console.error("Error registering commands:", err);
	});
