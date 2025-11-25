import {
	ComponentType,
	italic,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	changeCreditSettings,
	editServerCreditSetting,
	settings,
} from "../lib/settings";
import {
	comparePermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import { createServerSelectionMenu } from "../lib/embed/server";
import type { Server } from "../lib/server";
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
				)
				.addBooleanOption((option) =>
					option
						.setName("local")
						.setDescription(
							"Whether to edit local permission (default: false)",
						),
				),
		)
		.addSubcommand((command) =>
			command
				.setName("get")
				.setDescription("Get settings of the bot")
				.addBooleanOption((option) =>
					option
						.setName("local")
						.setDescription(
							"Whether to edit local permission (default: false)",
						),
				),
		),
	requireServer: false,
	async execute({ interaction, serverManager }) {
		const subcommand = interaction.options.getSubcommand(true);
		const local = interaction.options.getBoolean("local") ?? false;
		let server: Server | undefined = undefined;
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		if (local) {
			const reply = await interaction.editReply({
				content: "Please select a server:",
				components: [
					createServerSelectionMenu(serverManager.getAllTagPairs()),
				],
			});
			try {
				const selection = await reply.awaitMessageComponent({
					time: 60000,
					filter: (i) => i.user.id === interaction.user.id,
					componentType: ComponentType.StringSelect,
				});
				const selectedServerId = selection.values[0];
				if (!selectedServerId) {
					return selection.update({
						content: "No server selected",
						components: [],
					});
				}
				const selectedServer = serverManager.getServer(
					parseInt(selectedServerId),
				);
				if (!selectedServer) {
					return selection.update({
						content: "Selected server not found",
						components: [],
					});
				}
				server = selectedServer;
				await selection.update({
					content: "Server selected",
					components: [],
				});
			} catch (e) {
				console.error(e);
				return await interaction.editReply({
					content: "No server selected in time or an error occurred",
					components: [],
				});
			}
		}
		if (subcommand === "set") {
			if (
				!comparePermission(
					await readPermission(interaction.user),
					PermissionFlags.editSetting,
				)
			) {
				return await interaction.editReply({
					content: "You don't have permission to change settings",
				});
			}

			const setting = interaction.options.getString("setting", true);
			const value = interaction.options.getNumber("value", true);
			if (!Object.keys(settings).includes(setting)) {
				return await interaction.editReply({
					content: `Setting ${setting} not found, settings available: \`${Object.keys(settings).join(", ")}\``,
				});
			}
			if (server !== undefined) {
				await editServerCreditSetting(server.id, {
					[setting]: value,
				});
				return await interaction.editReply({
					content: `Setting ${setting} changed to ${value} for server ${server.config.tag ?? `Server #${server.id}`}`,
				});
			}
			changeCreditSettings({ [setting]: value });
			return await interaction.editReply({
				content: `Setting ${setting} changed to ${value}`,
			});
		}
		if (subcommand === "get") {
			const settingsList = Object.entries(
				server ? server.creditSettings : settings,
			)
				.map(([key, value]) => `${italic(key)}: \`${value}\``)
				.join("\n");
			return await interaction.editReply({
				content: `**Settings${
					server
						? ` for ${server.config.tag ?? `Server #${server.id}`}**`
						: "**"
				}:\n\n${settingsList}`,
			});
		}
	},
} satisfies CommandFile<false>;
