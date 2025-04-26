import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { changeSettings, settings } from "../lib/settings";
import { PermissionFlags } from "../lib/permission";

export default {
	command: new SlashCommandBuilder()
		.setName("changesettings")
		.setDescription("Change the settings of the bot")
		.addStringOption((option) =>
			option
				.setName("setting")
				.setDescription("The setting to change")
				.setRequired(true),
		)
		.addNumberOption((option) =>
			option
				.setName("value")
				.setDescription("The value to set the setting to")
				.setRequired(true),
		),
	async execute(interaction, client) {
		const setting = interaction.options.getString("setting", true);
		const value = interaction.options.getNumber("value", true);
		if (!Object.keys(settings).includes(setting)) {
			return await interaction.reply({
				content: `Setting ${setting} not found, settings available: \`${Object.keys(settings).join(", ")}\``,
				flags: [MessageFlags.Ephemeral],
			});
		}
		changeSettings({ [setting]: value });
		await interaction.reply({
			content: `Setting ${setting} changed to ${value}`,
			flags: [MessageFlags.Ephemeral],
		});
	},
	permissions: [PermissionFlags.editSetting],
} as CommandFile;
