import { SlashCommandBuilder } from "discord.js";
import { data, type CommandFile } from "../../api";
import type { MinecraftConfig } from "../config";
import { isRegistered } from "../runtime/request";

const PLUGIN_ID = "minecraft";

export default {
	command: new SlashCommandBuilder()
		.setName("unlink")
		.setDescription("Unlink your account")
		.addStringOption((option) =>
			option
				.setName("playername")
				.setDescription("Minecraft Player Name in exact match")
				.setRequired(true),
		),
	requireServer: true,
	async execute({ interaction, server }) {
		if (server.pluginId !== PLUGIN_ID) {
			return await interaction.editReply(
				"This command is only available on Minecraft servers.",
			);
		}
		const playerName = interaction.options.getString("playername", true);

		// Look up the caller's own identity links and match by stored playername.
		const links = await data.request("identity:getByDiscord", {
			pluginId: PLUGIN_ID,
			discordId: interaction.user.id,
		});
		const match = links.find((link) => {
			const meta = link.metadata as Record<string, unknown> | null;
			return meta && meta.playername === playerName;
		});
		if (!match) {
			return await interaction.editReply(
				"No linked account found with that player name for your Discord account!\n\nIf you have changed your player name recently, please relogin to the server to update it first!",
			);
		}

		await data.request("identity:unlink", {
			pluginId: PLUGIN_ID,
			externalId: match.externalId,
		});

		// Best-effort: notify the server that the link is gone.
		const { apiPort } = server.getPluginConfig() as unknown as MinecraftConfig;
		if (apiPort !== null) await isRegistered(apiPort, match.externalId);

		await interaction.editReply("Successfully unlinked your account!");
	},
	ephemeral: true,
	features: {
		unsuspendable: true,
	},
} satisfies CommandFile<true>;
