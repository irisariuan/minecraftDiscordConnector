import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { PermissionFlags, type CommandFile } from "../api";
import {
	checkForUpdate,
	getInstalled,
	GITHUB_SLUG,
	pluginDirOf,
	syncConnector,
} from "./lib";

export default {
	command: new SlashCommandBuilder()
		.setName("connector")
		.setDescription("Manage the Discord–Minecraft connector plugin")
		.addSubcommand((s) =>
			s
				.setName("status")
				.setDescription("Show the installed connector version"),
		)
		.addSubcommand((s) =>
			s
				.setName("check")
				.setDescription("Check GitHub for a newer connector release"),
		)
		.addSubcommand((s) =>
			s
				.setName("install")
				.setDescription(
					"Install the latest connector (or adopt an existing jar) and record it",
				)
				.addBooleanOption((o) =>
					o
						.setName("force")
						.setDescription("Re-download even if already up to date"),
				),
		),
	requireServer: true,
	permissions: PermissionFlags.downloadPlugin,
	async execute({ interaction, server }) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const pluginDir = pluginDirOf(server.getPluginConfig());
		if (!pluginDir) {
			return interaction.editReply(
				"This server has no plugin directory, so the connector cannot be managed here.",
			);
		}
		const sub = interaction.options.getSubcommand(true);

		if (sub === "status") {
			const installed = await getInstalled(server.id);
			const embed = new EmbedBuilder()
				.setTitle("🔌 Connector Status")
				.setColor(installed ? 0x2ecc71 : 0x95a5a6)
				.setDescription(`Source: \`${GITHUB_SLUG}\``)
				.addFields(
					{
						name: "Installed version",
						value: installed ? `\`${installed.tag}\`` : "*not installed*",
					},
					{
						name: "File",
						value: installed
							? `\`${installed.assetName}\``
							: "—",
					},
				);
			return interaction.editReply({ embeds: [embed] });
		}

		if (sub === "check") {
			const check = await checkForUpdate(server.id);
			return interaction.editReply(
				check.updateAvailable
					? `⬆️ Update available: ${check.reason}`
					: `✅ ${check.reason}`,
			);
		}

		// install
		const force = interaction.options.getBoolean("force") ?? false;
		const result = await syncConnector(server.id, pluginDir, force);
		switch (result.status) {
			case "installed":
				return interaction.editReply(
					`✅ Installed connector \`${result.assetName}\` (${result.tag}).`,
				);
			case "updated":
				return interaction.editReply(
					`✅ Updated connector ${result.fromTag} → \`${result.tag}\`.`,
				);
			case "matched":
				return interaction.editReply(
					`✅ Adopted existing jar \`${result.assetName}\` and recorded it as \`${result.tag}\`.`,
				);
			case "upToDate":
				return interaction.editReply(
					`✅ Already up to date (\`${result.tag}\`).`,
				);
			case "noRelease":
				return interaction.editReply(
					"❌ Could not fetch a release from GitHub.",
				);
			case "noAsset":
				return interaction.editReply(
					"❌ The latest release has no .jar asset.",
				);
			default:
				return interaction.editReply(
					`❌ ${result.message ?? "Failed to install the connector."}`,
				);
		}
	},
} satisfies CommandFile<true>;
