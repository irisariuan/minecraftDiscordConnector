import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { data, type CommandFile } from "../../api";
import { consumeLink } from "../runtime/proxyLinks";

const PLUGIN_ID = "minecraft";

export default {
	command: new SlashCommandBuilder()
		.setName("linkcode")
		.setDescription(
			"Finish linking a Minecraft account using the code shown in game",
		)
		.addStringOption((option) =>
			option
				.setName("code")
				.setDescription("The six-digit code shown after /link in game")
				.setMinLength(6)
				.setMaxLength(6)
				.setRequired(true),
		),
	requireServer: false,
	async execute({ interaction }) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const code = interaction.options.getString("code", true).trim();

		const pending = consumeLink(code);
		if (!pending) {
			return await interaction.editReply(
				"That code is unknown or has expired. Run `/link` again in game to get a new one.",
			);
		}

		// The account may have been linked between the code being issued and
		// redeemed (e.g. through /link on another Discord account).
		const existing = await data
			.request("identity:getByExternal", {
				pluginId: PLUGIN_ID,
				externalId: pending.uuid,
			})
			.catch(() => null);
		if (existing) {
			return await interaction.editReply(
				"That Minecraft account has already been linked. Use `/unlink` first if you want to relink it.",
			);
		}

		const result = await data
			.request("identity:link", {
				pluginId: PLUGIN_ID,
				externalId: pending.uuid,
				discordId: interaction.user.id,
				metadata: { playername: pending.playername },
			})
			.catch(() => null);
		if (!result) {
			return await interaction.editReply(
				"Failed to link your account! Please try again later.",
			);
		}

		await interaction.editReply(
			`Successfully linked \`${pending.playername}\` to your Discord account!`,
		);
	},
} satisfies CommandFile<false>;
