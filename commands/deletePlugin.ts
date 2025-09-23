import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { getPluginFileName, removePluginByFileName, removePluginBySlugOrId } from "../lib/plugin";
import { comparePermission, readPermission, PermissionFlags } from "../lib/permission";

export default {
	command: new SlashCommandBuilder()
		.setName("deleteplugin")
		.setDescription("Delete a plugin from the server")
		.addStringOption((option) =>
			option
				.setName("plugin")
				.setDescription("The plugin to delete")
				.setRequired(true),
		),
	async execute(interaction, client) {
		const plugin = interaction.options.getString("plugin", true);
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		if (
			!comparePermission(
				await readPermission(interaction.user.id),
				PermissionFlags.deletePlugin,
			)
		) {
			return interaction.editReply({
				content: "You do not have permission to delete plugins.",
			});
		}
		if (await removePluginByFileName(plugin)) {
			await interaction.editReply(
				`Plugin \`${plugin}\` deleted successfully.`,
			);
		} else {
			await interaction.editReply(`Plugin \`${plugin}\` not found.`);
		}
	},
} as CommandFile;
