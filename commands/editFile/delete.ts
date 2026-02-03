import {
	SlashCommandSubcommandBuilder,
	type ChatInputCommandInteraction,
} from "discord.js";
import {
	comparePermission,
	PermissionFlags,
	readPermission,
} from "../../lib/permission";
import {
	changeCredit,
	sendCreditNotification,
	spendCredit,
} from "../../lib/credit";
import type { Server } from "../../lib/server";
import { safeJoin, safeJoinWithoutError } from "../../lib/utils";
import { existsSync } from "fs";
import { unlink } from "fs/promises";

export function initDeleteSubcommand(
	subcommand: SlashCommandSubcommandBuilder,
) {
	return subcommand
		.setName("delete")
		.setDescription("Delete a file on the server")
		.addStringOption((option) =>
			option
				.setName("filename")
				.setDescription("The name of the file to delete")
				.setRequired(true),
		)
}

export async function deleteHandler(
	interaction: ChatInputCommandInteraction,
	server: Server,
) {
	const filename = interaction.options.getString("filename", true);

	// Check if user has permission to delete files
	const userPermission = await readPermission(interaction.user, server.id);
	const hasApprovalPermission = comparePermission(
		userPermission,
		PermissionFlags.approveEditFiles,
	);
	if (!hasApprovalPermission) {
		const message = await interaction.followUp({
			content: `Deleting \`${filename}\` requires approval, please ask a staff to approve the following`
		})
	}
	

	// Charge credit for file deletion
	const payment = await spendCredit(interaction, {
		userId: interaction.user.id,
		cost: server.creditSettings.editFileFee,
		reason: `Delete File ${filename}`,
		serverId: server.id,
	});

	if (!payment) {
		return await interaction.editReply({
			content:
				"You do not have enough credit to delete files on this server.",
		});
	}

	try {
		// Validate file path is within server directory
		const filepath = safeJoinWithoutError(
			server.config.serverDir,
			filename,
		);

		// Check if file exists
		if (!filepath || !existsSync(filepath)) {
			await changeCredit({
				userId: interaction.user.id,
				change: -payment.changed,
				serverId: server.id,
				reason: "Delete File Request Failed Refund",
			});
			await sendCreditNotification({
				user: interaction.user,
				creditChanged: -payment.changed,
				reason: "Delete File Request Failed Refund",
				serverId: server.id,
			});
			return await interaction.editReply({
				content: `File \`${filename}\` does not exist or is out of boundary.`,
			});
		}

		// Delete the file
		await unlink(filepath);

		return await interaction.editReply({
			content: `Successfully deleted file \`${filename}\` from the server.`,
		});
	} catch (error) {
		console.error("Error deleting file:", error);
		return await interaction.editReply({
			content: `Failed to delete file \`${filename}\`. Error: ${error instanceof Error ? error.message : "Unknown error"}`,
		});
	}
}
