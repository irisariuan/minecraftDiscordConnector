import {
	channelMention,
	ChannelType,
	Collection,
	MessageFlags,
	MessageReaction,
	SlashCommandBuilder,
	ThreadAutoArchiveDuration,
	time,
	userMention,
} from "discord.js";
import "dotenv/config";
import type { CommandFile } from "../lib/commandFile";
import {
	changeCredit,
	sendCreditNotification,
	spendCredit,
} from "../lib/credit";
import {
	compareAnyPermissions,
	comparePermission,
	getUsersMatchedPermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import { uploadServerManager } from "../lib/plugin/uploadServer";
import {
	copyLocalPluginFileToServer,
	downloadWebPluginFileToLocal,
} from "../lib/plugin/web";
import { settings } from "../lib/settings";

if (!process.env.UPLOAD_URL) {
	throw new Error("UPLOAD_URL is not set in environment variables");
}

export default {
	command: new SlashCommandBuilder()
		.setName("uploadplugin")
		.setDescription("Upload a custom plugin to the server"),
	async execute(interaction, client) {
		if (interaction.channel?.type !== ChannelType.GuildText) {
			return await interaction.reply({
				content:
					"This command can only be used in a guild text channel",
				flags: [MessageFlags.Ephemeral],
			});
		}
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		if (
			!compareAnyPermissions(await readPermission(interaction.user.id), [
				PermissionFlags.downloadPlugin,
				PermissionFlags.voteDownloadPlugin,
			])
		) {
			return interaction.editReply({
				content: "You do not have permission to upload plugins.",
			});
		}

		if (
			!(await spendCredit(
				interaction.user.id,
				settings.uploadFileFee,
				"Upload Custom Mod to Server",
			))
		) {
			return await interaction.editReply({
				content: "You don't have enough credit to upload mod to server",
			});
		}
		await sendCreditNotification(
			{ user: interaction.user, creditChanged: -settings.uploadFileFee, reason: "Upload Custom Mod to Server" },
		);
		const thread = await interaction.channel.threads.create({
			name: "Upload File",
			invitable: false,
			type: ChannelType.PrivateThread,
			autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
			reason: `Upload file thread for ${interaction.user.tag}`,
			rateLimitPerUser: 10, // 10 seconds
		});
		const cleanUp = () => {
			thread.delete().catch(() => {});
			interaction.deleteReply().catch(() => {});
		};

		await interaction.editReply({
			content: `Please upload your file in ${channelMention(thread.id)}, if the file is too large, please try to zip it first.`,
		});
		await thread.members.add(interaction.user);
		const expire = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
		const cancelMessage = await thread.send(
			`Please your file as attachment here before ${time(expire)}. We accept \`.jar\`, \`.yaml\`, \`.yml\`, \`.conf\` and \`.zip\` files\nTo cancel the upload, react with ❌\nIf no file is uploaded before the expiration time, the upload will be cancelled **without** refunding.`,
		);
		await cancelMessage.react("❌");
		const token = uploadServerManager.createToken();
		await thread.send(
			`You may also upload the file to [our website](${process.env.UPLOAD_URL}/?id=${token})`,
		);
		const messages = await Promise.race([
			uploadServerManager.awaitToken(token, 1000 * 60 * 30),
			cancelMessage.awaitReactions({
				filter: (reaction, user) =>
					reaction.emoji.name === "❌" &&
					user.id === interaction.user.id,
				time: 1000 * 60 * 30, // 30 minutes
				max: 1,
				errors: ["time"],
			}),
			thread.awaitMessages({
				filter: (message) =>
					message.attachments.size === 1 &&
					message.author.id === interaction.user.id,
				time: 1000 * 60 * 30, // 30 minutes
				max: 1,
				errors: ["time"],
			}),
		]);
		let downloadingUrl: string;
		let filename: string;
		const isFile = !(messages instanceof Collection);
		if (isFile) {
			downloadingUrl = `${process.env.UPLOAD_URL}/file/${token}`;
			filename = messages.filename;
		} else {
			const firstMessage = messages.at(0);
			// Cancelled
			if (firstMessage instanceof MessageReaction) {
				await cancelMessage.reactions.removeAll().catch(() => {});
				await thread.send("Upload cancelled.");
				await thread.setLocked(true);
				await thread.setArchived(true);
				uploadServerManager.disposeToken(token);
				changeCredit(
					interaction.user.id,
					settings.uploadFileFee,
					"Refund for cancelled Upload Custom Mod to Server",
				);
				sendCreditNotification(
					{ user: interaction.user, creditChanged: settings.uploadFileFee, reason: "Refund for cancelled Upload Custom Mod to Server" },
				);
				setTimeout(cleanUp, 1000 * 10);
				return;
			}
			const attachment = firstMessage?.attachments.at(0);
			// No attachment
			if (!attachment?.url) {
				await thread.send(
					"No attachment or upload found, please try again.",
				);
				await thread.setLocked(true);
				await thread.setArchived(true);
				changeCredit(
					interaction.user.id,
					settings.uploadFileFee,
					"Refund for cancelled Upload Custom Mod to Server",
				);
				sendCreditNotification(
					{ user: interaction.user, creditChanged: settings.uploadFileFee, reason: "Refund for cancelled Upload Custom Mod to Server" },
				);
				setTimeout(cleanUp, 1000 * 10);
				return;
			}
			downloadingUrl = attachment.url;
			filename = attachment.name;
		}

		await thread.send(`File uploaded: ${downloadingUrl}`);
		console.log(
			`User ${interaction.user.tag} (${interaction.user.id}) uploaded file: ${filename ?? "NULL"} (${downloadingUrl})`,
		);
		if (
			comparePermission(
				await readPermission(interaction.user.id),
				PermissionFlags.downloadPlugin,
			)
		) {
			await thread.send(`The file will be added to the server shortly.`);
			const finalFilename = isFile
				? await copyLocalPluginFileToServer(messages)
				: await downloadWebPluginFileToLocal(downloadingUrl, filename);
			uploadServerManager.disposeToken(token);
			if (finalFilename) {
				await thread.send(`File \`${finalFilename}\` added to server.`);
			} else {
				await thread.send(
					`Failed to download the file, please check the URL or attachment.`,
				);
				changeCredit(
					interaction.user.id,
					settings.uploadFileFee,
					"Refund for failed to add uploaded Custom Mod to Server",
				);
				sendCreditNotification(
					{ user: interaction.user, creditChanged: settings.uploadFileFee, reason: "Refund for failed to add uploaded Custom Mod to Server" },
				);
			}
			return setTimeout(cleanUp, 1000 * 10);
		}

		await thread.send(
			`Please notify the staff to review your file. This thread will be deleted in 10 minutes.`,
		);
		await thread.members.remove(interaction.user);
		const message = await thread.send("Approve this file?");
		await message.react("✅");
		await message.react("❌");
		for (const userId of await getUsersMatchedPermission(
			PermissionFlags.downloadPlugin,
		)) {
			const user = await client.users.fetch(userId).catch(() => null);
			if (user) {
				await thread.members.add(user).catch(() => null);
				await user.send({
					content: `A new plugin file ${filename ?? downloadingUrl} has been uploaded and is pending your review: ${thread.url}, expires at ${time(expire)}`,
				});
			}
		}
		message
			.createReactionCollector({
				filter: async (reaction, user) =>
					!!(
						reaction.emoji.name &&
						["✅", "❌"].includes(reaction.emoji.name) &&
						!user.bot &&
						comparePermission(
							await readPermission(user.id),
							PermissionFlags.downloadPlugin,
						)
					),
				max: 1,
				time: 1000 * 60 * 10, // 10 minutes
			})
			.on("collect", async (reaction, user) => {
				await message.reactions.removeAll();
				if (reaction.emoji.name === "✅") {
					await thread.send(
						`File approved by ${userMention(user.id)}.`,
					);
					await thread.send(
						`The file will be added to the server shortly.`,
					);
					const finalFilename = isFile
						? await copyLocalPluginFileToServer(messages)
						: await downloadWebPluginFileToLocal(
								downloadingUrl,
								filename,
							);
					uploadServerManager.disposeToken(token);
					if (finalFilename) {
						await thread.send(`File added to server.`);
						await interaction.user.send(
							`Your uploaded file (${finalFilename}) has been approved and added to the server.`,
						);
					} else {
						await thread.send(
							`Failed to download the file, please check the URL or attachment.`,
						);
						await interaction.user.send(
							`Failed to add your uploaded file (${filename ?? downloadingUrl}) to the server, please check the URL or attachment.`,
						);
						changeCredit(
							interaction.user.id,
							settings.uploadFileFee,
							"Refund for failed to add uploaded Custom Mod to Server",
						);
						sendCreditNotification(
							{ user: interaction.user, creditChanged: settings.uploadFileFee, reason: "Refund for failed to add uploaded Custom Mod to Server" },
						);
					}
				} else {
					uploadServerManager.disposeToken(token);
					await thread.send(
						`File rejected by ${userMention(user.id)}.`,
					);
					await thread.send(
						`The file will not be added to the server.`,
					);
					await interaction.user.send(
						`Your uploaded file (${filename ?? downloadingUrl}) has been rejected by the staff and will not be added to the server.`,
					);
				}
				await thread.setLocked(true);
				await thread.setArchived(true);
				setTimeout(cleanUp, 1000 * 10);
			});
		setTimeout(cleanUp, 1000 * 60 * 10);
	},
} as CommandFile;
