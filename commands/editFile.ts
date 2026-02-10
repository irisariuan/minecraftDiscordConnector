import { SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { PermissionFlags } from "../lib/permission";
import { initEditSubcommand, editHandler } from "./editFile/edit";
import { initDeleteSubcommand, deleteHandler } from "./editFile/delete";
import { initLsSubcommand, lsHandler } from "./editFile/ls";
import { initViewSubcommand, viewHandler } from "./editFile/view";

export default {
	command: new SlashCommandBuilder()
		.setName("editfile")
		.setDescription("Manage files on the server")
		.addSubcommand((subcommand) => initEditSubcommand(subcommand))
		.addSubcommand((subcommand) => initDeleteSubcommand(subcommand))
		.addSubcommand((subcommand) => initLsSubcommand(subcommand))
		.addSubcommand((subcommand) => initViewSubcommand(subcommand)),
	requireServer: true,
	async execute({ interaction, server }) {
		const subcommand = interaction.options.getSubcommand(true);

		switch (subcommand) {
			case "edit": {
				return await editHandler(interaction, server);
			}
			case "delete": {
				return await deleteHandler(interaction, server);
			}
			case "ls": {
				return await lsHandler(interaction, server);
			}
			case "view": {
				return await viewHandler(interaction, server);
			}
			default:
				await interaction.editReply({
					content: "Unknown subcommand",
				});
				return;
		}
	},
	permissions: PermissionFlags.editFiles,
	ephemeral: true,
	features: {
		unsuspendable: true,
	},
} satisfies CommandFile<true>;
