import { italic, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { changeCreditSettings, settings } from "../lib/settings";
import {
	comparePermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
export default {
	command: new SlashCommandBuilder()
		.setName("settings")
		.setDescription("Credit related settings of the bot")
		.addSubcommand((command) =>
			command
				.setName("set")
				.setDescription("Set a setting")
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
		)
		.addSubcommand((command) =>
			command.setName("get").setDescription("Get settings of the bot"),
		),
	async execute({ interaction }) {
		const subcommand = interaction.options.getSubcommand(true);
		if (subcommand === "set") {
			if (
				!comparePermission(
					await readPermission(interaction.user),
					PermissionFlags.editSetting,
				)
			) {
				return await interaction.reply({
					content: "You don't have permission to change settings",
					flags: [MessageFlags.Ephemeral],
				});
			}

			const setting = interaction.options.getString("setting", true);
			const value = interaction.options.getNumber("value", true);
			if (!Object.keys(settings).includes(setting)) {
				return await interaction.reply({
					content: `Setting ${setting} not found, settings available: \`${Object.keys(settings).join(", ")}\``,
					flags: [MessageFlags.Ephemeral],
				});
			}
			changeCreditSettings({ [setting]: value });
			return await interaction.reply({
				content: `Setting ${setting} changed to ${value}`,
				flags: [MessageFlags.Ephemeral],
			});
		}
		if (subcommand === "get") {
			const settingsList = Object.entries(settings)
				.map(([key, value]) => `${italic(key)}: \`${value}\``)
				.join("\n");
			return await interaction.reply({
				content: `**Settings**:\n\n${settingsList}`,
				flags: [MessageFlags.Ephemeral],
			});
		}
	},
} as CommandFile<true>;
