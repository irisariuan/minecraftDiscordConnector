import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	changeCredit,
	changeJackpotNumber,
	getJackpot,
	jackpotNumber,
	sendCreditNotification,
	setJackpot,
	spendCredit,
} from "../lib/credit";
import { randomItem } from "../lib/utils";

export default {
	command: new SlashCommandBuilder()
		.setName("jackpot")
		.setDescription("Play the jackpot game")
		.addSubcommand((command) =>
			command
				.setName("play")
				.setDescription("Play the jackpot game")
				.addNumberOption((option) =>
					option
						.setName("guess")
						.setDescription("The number to guess")
						.setRequired(true)
						.setMinValue(1)
						.setMaxValue(10000),
				)
				.addNumberOption((option) =>
					option
						.setName("range")
						.setDescription(
							"15 credits for base, 5 credits per larger range",
						)
						.setRequired(true)
						.setMinValue(1)
						.setMaxValue(10000),
				),
		)
		.addSubcommand((command) =>
			command.setName("get").setDescription("Get the jackpot amount"),
		),
	async execute(interaction, client) {
		const subcommand = interaction.options.getSubcommand(true);
		if (subcommand === "play") {
			const guess = interaction.options.getNumber("guess", true);
			const range = interaction.options.getNumber("range", true);
			const max = guess - 1 + range;
			if (max > 10000) {
				return await interaction.reply({
					content: "Guess + range must be less or equals to 10000",
					flags: [MessageFlags.Ephemeral],
				});
			}
			if (
				!(await spendCredit(
					interaction.user.id,
					15 + (range - 1) * 5,
					"Jackpot Payment",
				))
			) {
				return await interaction.reply({
					content: `You don't have enough credit (Required ${15 + (range - 1) * 5} credits) to play the jackpot game`,
					flags: [MessageFlags.Ephemeral],
				});
			}
			await sendCreditNotification(
				interaction.user,
				-(15 + (range - 1) * 5),
				"Jackpot Payment",
			);

			if (jackpotNumber <= max && jackpotNumber >= guess) {
				await interaction.reply({
					content: `You won! The jackpot number was ${jackpotNumber}`,
				});
				const jackpot = await getJackpot();
				await changeCredit(interaction.user.id, jackpot, "Jackpot Win");
				await sendCreditNotification(
					interaction.user,
					jackpot,
					"Jackpot Win",
				);
				await setJackpot(0);
				changeJackpotNumber();
				return;
			}
			return await interaction.reply({
				content: randomItem([
					"You lost! Better luck next time!",
					"You were close! Try again!",
					"Not this time!",
					"Keep trying! You can do it!",
					"Don't give up! You can win!",
					"Maybe next time!",
					"Try again! You might win next time!",
					"Keep playing! You might win soon!",
					"Don't lose hope! You can win!",
					"Keep guessing! You might get it right!",
					"Don't stop trying! You can win!",
					"Keep playing! You might get lucky!",
					"Jackpot is waiting for you",
				]),
			});
		}
		if (subcommand === "get") {
			const jackpot = await getJackpot();
			return await interaction.reply({
				content: `The current jackpot amount is ${jackpot} credits`,
			});
		}
	},
} as CommandFile;
