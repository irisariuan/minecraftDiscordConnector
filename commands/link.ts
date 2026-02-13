import { ComponentType, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { createPlayer, hasPlayer } from "../lib/db";
import {
	createOtpButtonRow,
	createOtpInputModal,
	OTPAction,
} from "../lib/serverInstance/otp";
import { getRandomOtp } from "../lib/utils";

export default {
	command: new SlashCommandBuilder()
		.setName("link")
		.setDescription("Link your account to server")
		.addStringOption((option) =>
			option
				.setName("playername")
				.setDescription("Minecraft Player Name in exact match")
				.setRequired(true),
		),
	requireServer: true,
	async execute({ interaction, server }) {
		const playerName = interaction.options.getString("playername", true);
		const otp = getRandomOtp();
		const uuid = await server.register(playerName, otp);
		if (!uuid)
			return await interaction.editReply(
				"Player not found! Please check if your player name is correct!",
			);
		if (await hasPlayer(uuid)) {
			return await interaction.editReply(
				"This account has already been linked! If you want to relink, you need to first unlink using /unlink command!",
			);
		}
		const reply = await interaction.editReply({
			content: "Enter the OTP (valid in 5 minutes)",
			components: [createOtpButtonRow()],
		});
		const res = await reply
			.awaitMessageComponent({
				componentType: ComponentType.Button,
				filter: (i) =>
					i.user.id === interaction.user.id &&
					i.customId === OTPAction.OTP_SHOW_MODAL_BUTTON,
				time: 1000 * 60 * 5,
			})
			.catch(() => null);
		if (!res)
			return await interaction.editReply({
				content: "OTP expired!",
				components: [],
			});
		await res.showModal(createOtpInputModal(), {
			withResponse: true,
		});
		const submission = await res
			.awaitModalSubmit({
				time: 1000 * 60 * 5,
				filter: (i) =>
					i.user.id === interaction.user.id &&
					i.customId === OTPAction.OTP_MODAL,
			})
			.catch(() => null);
		if (!submission)
			return await interaction.editReply({
				content: "OTP expired!",
				components: [],
			});
		const inputOtp = submission.fields.getTextInputValue(
			OTPAction.OTP_TEXT_INPUT,
		);
		if (inputOtp !== otp) {
			return await submission.reply({
				content: "Invalid OTP!",
				flags: MessageFlags.Ephemeral,
			});
		}
		await createPlayer({
			data: {
				playername: playerName,
				uuid,
				discordId: interaction.user.id,
			},
		});
		if (await server.registered(uuid)) {
			await submission.reply({
				content: "Successfully linked your account!",
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await submission.reply({
				content: "Failed to link your account! Please try again later!",
				flags: MessageFlags.Ephemeral,
			});
		}
	},
	ephemeral: true,
	features: {
		requireStartedServer: true,
		supportedPlatforms: ["minecraft"],
	},
} satisfies CommandFile<true>;
