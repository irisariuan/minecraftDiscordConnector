import { italic, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	approvalSettings,
	changeApprovalSettings,
	changeCreditSettings,
	editSetting,
	settings,
} from "../lib/settings";
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
import { SettingType } from "../lib/db";

interface Setting {
	type: "credit" | "approval";
	name: string;
	description?: string;
}

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
						.setName("approval")
						.setDescription(
							"Whether to edit approval settings or credit settings (default: credit settings (false))",
						),
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
			const approval =
				interaction.options.getBoolean("approval") ?? false;
			const value = interaction.options.getNumber("value", true);
			if (approval) {
				if (!Object.keys(approvalSettings).includes(setting)) {
					return await interaction.editReply({
						content: `Approval setting ${setting} not found, settings available: \`${Object.keys(
							approvalSettings,
						).join(", ")}\``,
					});
				}
				if (server) {
					await editSetting(server, SettingType.Approval, {
						[setting]: value,
					});
					return await interaction.editReply({
						content: `Approval setting ${setting} changed to ${value} for server ${
							server.config.tag ?? `Server #${server.id}`
						}`,
					});
				}
				changeApprovalSettings({ [setting]: value }, serverManager);
				return await interaction.editReply({
					content: `Approval setting ${setting} changed to ${value}`,
				});
			}

			if (!Object.keys(settings).includes(setting)) {
				return await interaction.editReply({
					content: `Setting ${setting} not found, settings available: \`${Object.keys(settings).join(", ")}\``,
				});
			}
			if (server) {
				await editSetting(server, SettingType.ServerCredit, {
					[setting]: value,
				});
				return await interaction.editReply({
					content: `Setting ${setting} changed to ${value} for server ${server.config.tag ?? `Server #${server.id}`}`,
				});
			}
			changeCreditSettings({ [setting]: value }, serverManager);
			return await interaction.editReply({
				content: `Setting ${setting} changed to ${value}`,
			});
		}
		if (subcommand === "get") {
			const creditSettingsList = Object.entries(
				server ? server.creditSettings : settings,
			)
				.map(([key, value]) => `${italic(key)}: \`${value}\``)
				.join("\n");
			const approvalSettingsList = Object.entries(
				server ? server.approvalSettings : approvalSettings,
			)
				.map(([key, value]) => `${italic(key)}: \`${value}\``)
				.join("\n");
			return await interaction.editReply({
				content: `**Settings${
					server
						? ` for ${server.config.tag ?? `Server #${server.id}`}**`
						: "**"
				}:\n\n${creditSettingsList}\n\n**Approval Settings**:\n\n${approvalSettingsList}`,
			});
		}
	},
	autoComplete: async ({ interaction }) => {
		const subcommand = interaction.options.getSubcommand(true);
		if (subcommand === "set") {
			const focusedOption = interaction.options.getFocused(true);
			if (focusedOption.name === "setting") {
				const input = focusedOption.value.toLowerCase();
				const isApproval = interaction.options.getBoolean("approval");
				const isLocal =
					interaction.options.getBoolean("local") ?? false;

				const creditMappedSettings: Setting[] = Object.keys(
					settings,
				).map(
					(name) =>
						({
							type: "credit",
							name,
							description: isLocal
								? undefined
								: `Now global value: ${
										settings[
											name as keyof typeof settings
										] ?? "unknown"
									}`,
						}) satisfies Setting,
				);
				const approvalMappedSettings: Setting[] = Object.keys(
					approvalSettings,
				).map(
					(name) =>
						({
							type: "approval",
							name,
							description: isLocal
								? undefined
								: `Now global value: ${
										approvalSettings[
											name as keyof typeof approvalSettings
										] ?? "unknown"
									}`,
						}) satisfies Setting,
				);

				const allSettings: Setting[] = isApproval
					? approvalMappedSettings
					: [...creditMappedSettings, ...approvalMappedSettings];

				const filtered = allSettings.filter(
					(setting) =>
						setting.name.toLowerCase().includes(input) ||
						setting.description?.toLowerCase().includes(input),
				);
				const choices = filtered.slice(0, 25).map((setting) => ({
					name: `${setting.name} (${setting.type} setting)${setting.description ? ` - ${setting.description}` : ""}`,
					value: setting.name,
				}));
				return interaction.respond(choices);
			}
		}
	},
} satisfies CommandFile<false>;
