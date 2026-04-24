import { italic, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { changeSettings, editSetting, settings } from "../lib/settings";
import {
	comparePermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import {
	createServerSelectionMenu,
	getUserSelectedServer,
} from "../lib/component/server";
import type { Server } from "../lib/server";

export default {
	command: new SlashCommandBuilder()
		.setName("settings")
		.setDescription("Credit and approval related settings of the bot")
		.addSubcommand((command) =>
			command
				.setName("set")
				.setDescription("Set a setting")
				.addStringOption((option) =>
					option
						.setName("setting")
						.setDescription("The setting to change")
						.setRequired(true)
						.setAutocomplete(true),
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
							"Whether to edit local (per-server) permission (default: false)",
						),
				),
		),
	requireServer: false,
	async execute({ interaction, serverManager }) {
		const subcommand = interaction.options.getSubcommand(true);
		const local = interaction.options.getBoolean("local") ?? false;
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const server: Server | null = local
			? await getUserSelectedServer(serverManager, interaction, true)
			: null;

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

			if (server) {
				await editSetting(server, { [setting]: value });
				return await interaction.editReply({
					content: `Setting ${setting} changed to ${value} for server ${
						server.config.tag ?? `Server #${server.id}`
					}`,
				});
			}

			changeSettings({ [setting]: value }, serverManager);
			return await interaction.editReply({
				content: `Setting ${setting} changed to ${value}`,
			});
		}

		if (subcommand === "get") {
			const settingsList = Object.entries(
				server ? server.settings : settings,
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
	autoComplete: async ({ interaction }) => {
		const subcommand = interaction.options.getSubcommand(true);
		if (subcommand === "set") {
			const focusedOption = interaction.options.getFocused(true);
			if (focusedOption.name === "setting") {
				const input = focusedOption.value.toLowerCase();
				const isLocal =
					interaction.options.getBoolean("local") ?? false;

				const allSettings = Object.keys(settings).map((name) => ({
					name,
					description: isLocal
						? undefined
						: `Now global value: ${
								settings[name as keyof typeof settings] ??
								"unknown"
							}`,
				}));

				const filtered = allSettings.filter(
					(s) =>
						s.name.toLowerCase().includes(input) ||
						s.description?.toLowerCase().includes(input),
				);

				const choices = filtered.slice(0, 25).map((s) => ({
					name: `${s.name}${s.description ? ` - ${s.description}` : ""}`,
					value: s.name,
				}));

				return interaction.respond(choices);
			}
		}
	},
} satisfies CommandFile<false>;
