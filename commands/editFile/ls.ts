import {
	SlashCommandSubcommandBuilder,
	type ChatInputCommandInteraction,
} from "discord.js";
import {
	changeCredit,
	sendCreditNotification,
	spendCredit,
} from "../../lib/credit";
import type { Server } from "../../lib/server";
import {
	formatFileSize,
	readDir,
	safeJoin,
	safeJoinWithoutError,
	type FileInfo,
} from "../../lib/utils";
import { existsSync, statSync, readdirSync } from "fs";
import { sendPaginationMessage } from "../../lib/pagination";

export function initLsSubcommand(subcommand: SlashCommandSubcommandBuilder) {
	return subcommand
		.setName("ls")
		.setDescription("List files in a directory on the server")
		.addStringOption((option) =>
			option
				.setName("path")
				.setDescription(
					"The directory path to list (leave empty for server root)",
				)
				.setRequired(false),
		);
}

export async function lsHandler(
	interaction: ChatInputCommandInteraction,
	server: Server,
) {
	const path = interaction.options.getString("path") ?? "";

	// Charge credit for listing files
	const payment = await spendCredit(interaction, {
		userId: interaction.user.id,
		cost: server.creditSettings.lsFilesFee,
		reason: `List Files ${path || "(root)"}`,
		serverId: server.id,
	});

	if (!payment) {
		return await interaction.editReply({
			content:
				"You do not have enough credit to list files on this server.",
		});
	}

	// Validate directory path is within server directory
	const dirpath = safeJoinWithoutError(server.config.serverDir, path);

	// Check if directory exists
	if (!dirpath || !existsSync(dirpath)) {
		await changeCredit({
			userId: interaction.user.id,
			change: -payment.changed,
			serverId: server.id,
			reason: "List Files Request Failed Refund",
		});
		await sendCreditNotification({
			user: interaction.user,
			creditChanged: -payment.changed,
			reason: "List Files Request Failed Refund",
			serverId: server.id,
		});
		return await interaction.editReply({
			content: `Directory \`${path || "(root)"}\` does not exist or is out of boundary.`,
		});
	}

	// Check if it's actually a directory
	const stat = statSync(dirpath);
	if (!stat.isDirectory()) {
		return await interaction.editReply({
			content: `\`${path}\` is not a directory.`,
		});
	}

	const fileInfos = readDir(dirpath);

	// Sort: directories first, then by name
	fileInfos.sort((a, b) => {
		if (a.isDirectory !== b.isDirectory) {
			return a.isDirectory ? -1 : 1;
		}
		return a.name.localeCompare(b.name);
	});

	await sendPaginationMessage({
		interaction,
		getResult: async () => fileInfos,
		formatter: (file: FileInfo) => {
			const type = file.isDirectory ? "📁 DIR" : "📄 FILE";
			const size = file.isDirectory
				? ""
				: ` (${formatFileSize(file.size)})`;
			const modified = `<t:${Math.floor(file.modified.getTime() / 1000)}:R>`;
			return {
				name: `${type} ${file.name}`,
				value: `${size ? `Size: ${size}\n` : ""}Modified: ${modified}`,
			};
		},
		filterFunc: (filter?: string) => (file: FileInfo) => {
			if (!filter) return true;
			const searchText = filter.toLowerCase();
			return file.name.toLowerCase().includes(searchText);
		},
		options: {
			title: `Files in: ${path || "(server root)"}`,
			mainColor: "Blue",
			notFoundMessage: "No files found in this directory.",
		},
		interactionFilter: (i) => i.user.id === interaction.user.id,
	});
}
