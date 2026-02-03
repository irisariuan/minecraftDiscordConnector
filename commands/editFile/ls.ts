import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	MessageFlags,
	SlashCommandSubcommandBuilder,
	time,
	type ChatInputCommandInteraction,
	type MessageActionRowComponentBuilder,
} from "discord.js";
import {
	changeCredit,
	sendCreditNotification,
	spendCredit,
} from "../../lib/credit";
import type { Server } from "../../lib/server";
import {
	formatFileSize,
	getParentPath,
	joinPathSafe,
	validateAndReadDir,
	type FileInfo,
} from "../../lib/utils";
import { existsSync, statSync } from "fs";
import { sendPaginationMessage } from "../../lib/pagination";
import { CacheItem } from "../../lib/cache";

enum LsNavigationAction {
	BackButton = "ls_back_button",
}

// Cache for directory listings - Map of path to CacheItem
const dirCacheMap = new Map<string, CacheItem<FileInfo[]>>();
const MAX_CACHE_ENTRIES = 50;

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
	const currentPath = interaction.options.getString("path") ?? "";

	// Charge credit once for the initial command
	const payment = await spendCredit(interaction, {
		userId: interaction.user.id,
		cost: server.creditSettings.lsFilesFee,
		reason: `List Files ${currentPath || "(root)"}`,
		serverId: server.id,
	});

	if (!payment) {
		return await interaction.editReply({
			content:
				"You do not have enough credit to list files on this server.",
		});
	}

	// Validate initial directory path is within server directory
	const initialFiles = validateAndReadDir(
		server.config.serverDir,
		currentPath,
	);

	// Check if directory exists and is valid
	if (initialFiles.length === 0 && currentPath) {
		// Try to check if path exists but is not a directory
		const dirpath = require("path").join(
			server.config.serverDir,
			currentPath,
		);
		const isEmpty = !existsSync(dirpath);
		if (isEmpty) {
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
				content: `Directory \`${currentPath || "(root)"}\` does not exist or is out of boundary.`,
			});
		}
		// Empty directory is valid
	}

	// Use closure to maintain current path state
	let currentNavigationPath = currentPath;

	// Helper function to get files for current path with caching
	const getFilesForPath = async (pathToRead: string): Promise<FileInfo[]> => {
		const cacheKey = `${server.id}:${pathToRead}`;

		// Get or create cache item
		let cacheItem = dirCacheMap.get(cacheKey);
		if (!cacheItem) {
			// Implement LRU eviction if at capacity
			if (dirCacheMap.size >= MAX_CACHE_ENTRIES) {
				const firstKey = dirCacheMap.keys().next().value;
				if (firstKey) dirCacheMap.delete(firstKey);
			}

			cacheItem = new CacheItem<FileInfo[]>(null, {
				updateMethod: () =>
					validateAndReadDir(server.config.serverDir, pathToRead),
				ttl: 30000, // 30 seconds TTL
			});
			dirCacheMap.set(cacheKey, cacheItem);
		}

		// Get data from cache (will auto-update if expired)
		const data = await cacheItem.getData();
		return data ?? [];
	};

	// Helper function to create back button based on path
	const createBackButton = (
		pathForButton: string,
	): ActionRowBuilder<MessageActionRowComponentBuilder>[] => {
		if (!pathForButton) return [];
		const backButton = new ButtonBuilder()
			.setCustomId(LsNavigationAction.BackButton)
			.setLabel("⬆️ Back to Parent Directory")
			.setStyle(ButtonStyle.Secondary);
		return [
			new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
				backButton,
			),
		];
	};

	await sendPaginationMessage({
		interaction,
		getResult: async () => getFilesForPath(currentNavigationPath),
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
		selectMenuTransform: (file: FileInfo) => ({
			label: file.isDirectory ? `📁 ${file.name}` : `📄 ${file.name}`,
			value: file.name,
			description: file.isDirectory
				? "Navigate to this directory"
				: `File (${formatFileSize(file.size)})`,
		}),
		onItemSelected: async (
			selectInteraction,
			currentResult,
			refreshDisplay,
		) => {
			const selectedFileName = selectInteraction.values[0];
			const data = await currentResult.getData();
			const selectedFile = data?.find((f) => f.name === selectedFileName);

			if (!selectedFile) {
				await selectInteraction.reply({
					content: "Selected file not found.",
					flags: MessageFlags.Ephemeral,
				});
				return false;
			}

			if (selectedFile.isDirectory) {
				await selectInteraction.deferUpdate();
				// Update current path using helper
				const newPath = joinPathSafe(
					currentNavigationPath,
					selectedFile.name,
				);
				if (newPath === null) return false; // Invalid path, do nothing
				currentNavigationPath = newPath;

				// Refresh the display with new path
				await refreshDisplay();
				return false; // Don't stop collector
			} else {
				const fullPath = joinPathSafe(
					currentNavigationPath,
					selectedFile.name,
				);
				await selectInteraction.reply({
					content: `Selected file: \`${fullPath ?? selectedFile.name}\`.${
						selectedFile.size
							? ` Size: ${formatFileSize(selectedFile.size)}.`
							: ""
					}\nModified: ${time(selectedFile.modified)}`,
					flags: MessageFlags.Ephemeral,
				});
				return false;
			}
		},
		onComponentRowsReacted: async (
			componentInteraction,
			currentResult,
			refreshDisplay,
		) => {
			if (
				componentInteraction.customId === LsNavigationAction.BackButton
			) {
				await componentInteraction.deferUpdate();
				// Calculate parent path using helper
				currentNavigationPath = getParentPath(currentNavigationPath);

				// Refresh the display with new path
				await refreshDisplay();
				return false; // Don't stop collector
			}
			return false;
		},
		customComponentRows: () => createBackButton(currentNavigationPath),
		options: {
			title: () =>
				`Files in: ${currentNavigationPath || "(server root)"}`,
			mainColor: "Blue",
			notFoundMessage: "No files found in this directory.",
			selectMenuPlaceholder:
				"Select a folder to navigate or a file to view info",
		},
		interactionFilter: (i) => i.user.id === interaction.user.id,
	});
}
