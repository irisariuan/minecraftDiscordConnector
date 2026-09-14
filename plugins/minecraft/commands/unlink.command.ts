import { SlashCommandBuilder } from "discord.js";
import { data, type CommandFile } from "../../api";
import { markVerifiedOnServer } from "../runtime/request";

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
		// All of them, not just the first: a player linked from the waiting room
		// is recorded under both the identity Mojang verified and the one an
		// offline-mode backend derives from their name. Removing one of those
		// would leave them still linked from the other side.
		const matches = links.filter((link) => {
			const meta = link.metadata as Record<string, unknown> | null;
			return meta && meta.playername === playerName;
		});
		if (matches.length === 0) {
			return await interaction.editReply(
				"No linked account found with that player name for your Discord account!\n\nIf you have changed your player name recently, please relogin to the server to update it first!",
			);
		}

		for (const match of matches) {
			await data.request("identity:unlink", {
				pluginId: PLUGIN_ID,
				externalId: match.externalId,
			});

			// Best-effort: poke the running server about the player. No-op when
			// the connector plugin is not attached.
			await markVerifiedOnServer(server.id, match.externalId);
		}

		await interaction.editReply("Successfully unlinked your account!");
	},
	ephemeral: true,
	features: {
		unsuspendable: true,
	},
} satisfies CommandFile<true>;
