import {
	GuildMember,
	MessageFlags,
	Role,
	roleMention,
	SlashCommandBuilder,
	User,
	userMention,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { changeCredit, sendCreditNotification, setCredit } from "../lib/credit";
import { PermissionFlags } from "../lib/permission";

export default {
	command: new SlashCommandBuilder()
		.setName("changecredit")
		.setDescription("Change the credit of a user")
		.addSubcommand((command) =>
			command
				.setName("set")
				.setDescription("Set the credit of a user")
				.addMentionableOption((option) =>
					option
						.setName("user")
						.setDescription("The user(s) to set the credit of")
						.setRequired(true),
				)
				.addNumberOption((option) =>
					option
						.setName("amount")
						.setDescription("The amount of credit to set")
						.setRequired(true),
				)
				.addBooleanOption((option) =>
					option
						.setName("silent")
						.setDescription(
							"Whether send credit notification to user(s) or not",
						),
				),
		)
		.addSubcommand((command) =>
			command
				.setName("change")
				.setDescription("Change credit of user(s)")
				.addMentionableOption((option) =>
					option
						.setName("user")
						.setDescription("The user(s) to change credit to")
						.setRequired(true),
				)
				.addNumberOption((option) =>
					option
						.setName("amount")
						.setDescription("The amount of credit to change")
						.setRequired(true),
				)
				.addBooleanOption((option) =>
					option
						.setName("silent")
						.setDescription(
							"Whether send credit notification to user(s) or not",
						),
				),
		),
	async execute(interaction, client) {
		await interaction.deferReply({
			flags: [MessageFlags.Ephemeral],
		});
		const subCommand = interaction.options.getSubcommand(true);
		const user = interaction.options.getMentionable("user", true);
		const amount = interaction.options.getNumber("amount", true);
		const silent = interaction.options.getBoolean("silent") === true;
		const users =
			user instanceof Role
				? Array.from(user.members).map((member) => member[1])
				: user instanceof User || user instanceof GuildMember
					? [user]
					: [];
		if (users.length === 0 || !users[0]) {
			return interaction.editReply({
				content: "No users found",
			});
		}
		if (subCommand === "set") {
			await Promise.all(
				users.map(async (user) => {
					const original = await setCredit(
						user.id,
						amount,
						"Set by admin",
					);
					console.log(`Set ${user.displayName} credit to ${amount}`);
					if (!silent)
						await sendCreditNotification(
							user,
							amount - original,
							"Set by admin",
							true,
						);
				}),
			);
			await interaction.editReply({
				content: `Set credit of ${user instanceof Role ? roleMention(user.id) : userMention(users[0].id)} to ${amount}`,
			});
		} else if (subCommand === "change") {
			Promise.all(
				users.map(async (user) => {
					await changeCredit(user.id, amount, "Changed by admin");
					console.log(
						`Changed ${user.displayName} credit by ${amount}`,
					);
					if (!silent)
						await sendCreditNotification(
							user,
							amount,
							"Changed by admin",
							true,
						);
				}),
			);
			await interaction.editReply({
				content: `Changed credit of ${user instanceof Role ? roleMention(user.id) : userMention(users[0].id)} by ${amount}`,
			});
		}
	},
	permissions: [PermissionFlags.creditEdit],
} as CommandFile;
