import {
	ChannelType,
	MessageFlags,
	SlashCommandBuilder,
	ThreadAutoArchiveDuration,
	time,
	userMention,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	comparePermission,
	getUsersWithMatchedPermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import { uploadServer } from "../lib/plugin/uploadServer";
import { UPLOAD_URL } from "../lib/env";
import { TokenType } from "../lib/plugin/uploadServer/utils";

export default {
	command: new SlashCommandBuilder()
		.setName("editfile")
		.setDescription("Edit files on the server")
		.addStringOption((option) =>
			option
				.setName("filename")
				.setDescription("The name of the file to edit")
				.setRequired(true),
		)
		.addBooleanOption((option) =>
			option
				.setName("create")
				.setDescription("Create the file if it does not exist")
				.setRequired(false),
		),
	requireServer: true,
	async execute({ interaction, server }) {
		if (!UPLOAD_URL) {
			return await interaction.followUp({
				content: "File upload service is not configured.",
			});
		}

		if (interaction.channel?.type !== ChannelType.GuildText) {
			return await interaction.followUp({
				content:
					"This command can only be used in a guild text channel",
				flags: [MessageFlags.Ephemeral],
			});
		}
		const filename = interaction.options.getString("filename", true);
		const createIfNotExist =
			interaction.options.getBoolean("create") ?? false;
		const editTokenType = comparePermission(
			await readPermission(interaction.user, server.id),
			PermissionFlags.approveEditFiles,
		)
			? TokenType.EditForceToken
			: TokenType.EditToken;
		const result = uploadServer.createEditToken({
			file: {
				filename,
				containingFolderPath: server.config.serverDir,
			},
			type: editTokenType,
			bypassFileExistCheck: createIfNotExist,
		});
		if (!result) {
			return await interaction.followUp({
				content: `Failed to create edit session for file ${filename}. It may not exist.`,
			});
		}
		const { token, sessionId } = result;
		const editUrl = `${UPLOAD_URL}/edit/?id=${token}`;
		try {
			await interaction.user.send({
				content: `You can edit the file using the following [link](${editUrl}). The link will expire in 15 minutes.`,
			});
		} catch {
			await interaction.followUp({
				content:
					"I couldn't send you a DM. Please make sure your DMs are open and try again.",
			});
			return uploadServer.disposeToken(token);
		}
		const disposeTokenTimeout = setTimeout(
			() => uploadServer.disposeToken(token),
			1000 * 60 * 15,
		);
		console.log("Awaiting file");
		const editFile = await uploadServer.awaitEditToken(token).catch(() => {
			uploadServer.disposeToken(token);
			return null;
		});
		clearTimeout(disposeTokenTimeout);
		if (!editFile)
			return console.log("File edit session expired or was cancelled");
		if (editTokenType === TokenType.EditForceToken) {
			console.log("File edited forcefully");
			uploadServer.disposeToken(token);
			return await interaction.followUp({
				content: `Your changes to file \`${filename}\` have been applied to the server.`,
			});
		}
		console.log("File edited, pending approval");
		const thread = await interaction.channel.threads.create({
			name: `Edit File: ${filename}`,
			invitable: false,
			type: ChannelType.PrivateThread,
			autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays,
			reason: `Edit file thread for ${interaction.user.tag}`,
		});
		// expires in 3 hours
		const expireTime = 1000 * 60 * 60 * 3;
		const expire = new Date(Date.now() + expireTime);
		const expirePromise = new Promise((_, r) => setTimeout(r, expireTime));
		const diffTokenResult = uploadServer.createEditToken({
			file: editFile,
			type: TokenType.EditDiffToken,
			bypassFileExistCheck: true,
			sessionId,
		});
		if (!diffTokenResult)
			throw new Error("Failed to create edit diff token");
		const { token: diffToken } = diffTokenResult;
		const editDiffUrl = `${UPLOAD_URL}/edit/?id=${diffToken}`;
		for (const userId of await getUsersWithMatchedPermission(
			PermissionFlags.approveEditFiles,
		)) {
			const member = await interaction.guild?.members
				.fetch(userId)
				.catch(() => null);
			if (member) thread.members.add(member).catch(() => {});
			await member
				?.send(
					`User ${userMention(interaction.user.id)} has edited file \`${filename}\` and is pending your review: ${thread.url}, expires at ${time(expire)}`,
				)
				.catch(() => {});
		}
		await thread.send({
			content: `User ${userMention(interaction.user.id)} has edited the file \`${
				filename
			}\`. Please review the changes using [this link](${editDiffUrl}). This thread will expire at ${time(
				expire,
			)}.`,
		});
		try {
			Promise.race([await uploadServer.awaitEditToken(diffToken), expirePromise])
			thread.send({
				content: `The changes to file \`${filename}\` have been approved and applied to the server.`,
			});
		} catch {
			thread.send({
				content: `The changes to file \`${filename}\` have been rejected or the approval session has expired.`,
			});
		}
	},
	permissions: PermissionFlags.editFiles,
	ephemeral: true,
	features: {
		unsuspendable: true,
	},
} satisfies CommandFile<true>;
