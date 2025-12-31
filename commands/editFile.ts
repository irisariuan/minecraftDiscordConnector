import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { PermissionFlags } from "../lib/permission";
import { setActivity } from "../lib/utils";

export default {
	command: new SlashCommandBuilder()
		.setName("editfile")
		.setDescription("Edit files on the server"),
	requireServer: true,
	async execute({ interaction, client, server }) {},
	permissions: PermissionFlags.editFiles,
	ephemeral: true,
	features: {
		requireStartedServer: true,
	},
} satisfies CommandFile<true>;
