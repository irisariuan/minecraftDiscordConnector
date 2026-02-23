import {
	SlashCommandSubcommandBuilder,
	time,
	type ChatInputCommandInteraction,
} from "discord.js";
import { spendCredit } from "../../lib/credit";
import type { Server } from "../../lib/server";
import { safeJoinWithoutError } from "../../lib/utils";
import { existsSync, statSync } from "fs";
import { uploadServer } from "../../lib/plugin/uploadServer";
import { UPLOAD_URL } from "../../lib/env";

export function initViewSubcommand(subcommand: SlashCommandSubcommandBuilder) {
	return subcommand
		.setName("view")
		.setDescription("View a file in read-only mode (no editing)")
		.addStringOption((option) =>
			option
				.setName("file")
				.setDescription("The file path to view")
				.setRequired(true),
		)
		.addIntegerOption((option) =>
			option
				.setName("expiration")
				.setDescription(
					"Token expiration time in minutes (default: 15, max: 60)",
				)
				.setMinValue(1)
				.setMaxValue(60)
				.setRequired(false),
		);
}

export async function viewHandler(
	interaction: ChatInputCommandInteraction,
	server: Server,
) {
	const filename = interaction.options.getString("file", true);
	const expirationMinutes =
		interaction.options.getInteger("expiration") ?? 15;
	const expirationTime = expirationMinutes * 60 * 1000; // Convert to milliseconds

	if (
		!(await spendCredit({
			user: interaction.user,
			channel: interaction.channel,
			cost: server.creditSettings.viewFileFee,
			reason: `View File ${filename}`,
			serverId: server.id,
		}))
	) {
		return await interaction.editReply({
			content:
				"You do not have enough credit to view files on this server.",
		});
	}

	// Validate file path
	const filepath = safeJoinWithoutError(server.config.serverDir, filename);

	if (!filepath || !existsSync(filepath)) {
		return await interaction.editReply({
			content: `File \`${filename}\` does not exist or is out of boundary.`,
		});
	}

	// Check if it's a file (not a directory)
	const stat = statSync(filepath);
	if (!stat.isFile()) {
		return await interaction.editReply({
			content: `\`${filename}\` is not a file.`,
		});
	}

	// Create view token
	const result = uploadServer.token.createViewToken({
		file: {
			filename,
			containingFolderPath: server.config.serverDir,
		},
		expirationTime,
	});

	if (!result) {
		return await interaction.editReply({
			content: `Failed to create view token for \`${filename}\`.`,
		});
	}

	const { token } = result;
	const viewUrl = `${UPLOAD_URL}/view/${token}`;

	await interaction.editReply({
		content: [
			`Read-only view link created for: \`${filename}\`\nView it [here](${viewUrl})\nExpires at ${time(expirationTime)}`,
		].join("\n"),
	});
	console.log(
		`View token created for ${filename} by ${interaction.user.tag} (expires in ${expirationMinutes} minutes)`,
	);
}
