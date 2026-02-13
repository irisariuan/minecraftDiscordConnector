import { SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { deletePlayerByUuid, getPlayerByName } from "../lib/db";
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
		const playerName = interaction.options.getString("playername", true);
		const players = await getPlayerByName(playerName);
		const player = players[0];
		if (!player) {
			return await interaction.editReply(
				"Player not found! Please check if your player name is correct!\n\nIf you have changed your player name recently, please relogin to the server to update your player name in the database!",
			);
		}
		if (players.length > 1) {
			return await interaction.editReply(
				`Multiple players found with the name ${playerName}! Please contact the server administrator to unlink your account!`,
			);
		}
		if (player.discordId !== interaction.user.id) {
			return await interaction.editReply(
				"This player name is linked to another Discord account! If you think this is a mistake, please contact the server administrator!",
			);
		}
		await deletePlayerByUuid(player.uuid);
		await server.registered(player.uuid);
		await interaction.editReply("Successfully unlinked your account!");
	},
	ephemeral: true,
	features: {
		unsuspendable: true,
		supportedPlatforms: ["minecraft"],
	},
} satisfies CommandFile<true>;
