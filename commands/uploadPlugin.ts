import {
	ButtonInteraction,
	channelMention,
	ChannelType,
	Collection,
	ComponentType,
	Message,
	MessageFlags,
	SlashCommandBuilder,
	ThreadAutoArchiveDuration,
	time,
	userMention,
	type Snowflake,
} from "discord.js";
import "dotenv/config";
import type { CommandFile } from "../lib/commandFile";
import { createRequestComponent } from "../lib/components";
import {
	changeCredit,
	sendCreditNotification,
	spendCredit,
} from "../lib/credit";
import {
	anyPerm,
	comparePermission,
	getUsersWithMatchedPermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import type { FileBuffer } from "../lib/plugin/uploadServer";
import { uploadserver } from "../lib/plugin/uploadServer";
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
	requireServer: true,
	async execute({ interaction, client, server }) {
		if (interaction.channel?.type !== ChannelType.GuildText) {
			return await interaction.followUp({
				content:
					"This command can only be used in a guild text channel",
				flags: [MessageFlags.Ephemeral],
			});
		}

		if (
			!(await spendCredit({
				userId: interaction.user.id,
				cost: settings.uploadFileFee,
				reason: "Upload Custom Mod to Server",
				serverId: server.id,
			}))
		) {
			return await interaction.editReply({
				content: "You don't have enough credit to upload mod to server",
			});
		}
		await sendCreditNotification({
			user: interaction.user,
			creditChanged: -settings.uploadFileFee,
			reason: "Upload Custom Mod to Server",
			serverId: server.id,
		});
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
		const cancelMessage = await thread.send({
			content: `Please your file as attachment here before ${time(expire)}. We accept \`.jar\`, \`.yaml\`, \`.yml\`, \`.conf\` and \`.zip\` files\nTo cancel the upload, click the cancel button\nIf no file is uploaded before the expiration time, the upload will be cancelled **without** refunding.`,
			components: [
				createRequestComponent({
					showAllow: false,
					showDeny: false,
					showCancel: true,
				}),
			],
		});
		const promises: Promise<
			Collection<Snowflake, Message> | ButtonInteraction | FileBuffer
		>[] = [
			cancelMessage.awaitMessageComponent({
				filter: (componentInteraction) =>
					componentInteraction.user.id === interaction.user.id,
				time: 1000 * 60 * 30, // 30 minutes
				componentType: ComponentType.Button,
			}),
			thread.awaitMessages({
				filter: (message) =>
					message.attachments.size === 1 &&
					message.author.id === interaction.user.id,
				time: 1000 * 60 * 30, // 30 minutes
				max: 1,
				errors: ["time"],
			}),
		];

		const token = uploadserver.createFileToken();
		await thread.send(
			`You may also upload the file to [our website](${process.env.UPLOAD_URL}/?id=${token})`,
		);
		promises.push(uploadserver.awaitFileToken(token, 1000 * 60 * 30));
		const messages = await Promise.race(promises);
		if (messages instanceof ButtonInteraction) {
			await messages.reply("Upload cancelled.");
			await thread.setLocked(true);
			await thread.setArchived(true);
			uploadserver.disposeToken(token);
			changeCredit({
				userId: interaction.user.id,
				change: settings.uploadFileFee,
				reason: "Refund for cancelled Upload Custom Mod to Server",
				serverId: server.id,
			});
			sendCreditNotification({
				user: interaction.user,
				creditChanged: settings.uploadFileFee,
				reason: "Refund for cancelled Upload Custom Mod to Server",
				serverId: server.id,
			});
			setTimeout(cleanUp, 1000 * 10);
			return;
		}
		let downloadingUrl: string;
		let filename: string;
		const isFile = "filename" in messages;
		if (isFile) {
			downloadingUrl = `${process.env.UPLOAD_URL}/file/${token}`;
			filename = messages.filename;
		} else {
			const firstMessage = messages.at(0);
			const attachment = firstMessage?.attachments.at(0);
			// No attachment
			if (!attachment?.url) {
				await thread.send(
					"No attachment or upload found, please try again.",
				);
				await thread.setLocked(true);
				await thread.setArchived(true);
				changeCredit({
					userId: interaction.user.id,
					change: settings.uploadFileFee,
					serverId: server.id,
					reason: "Refund for cancelled Upload Custom Mod to Server",
				});
				sendCreditNotification({
					user: interaction.user,
					creditChanged: settings.uploadFileFee,
					reason: "Refund for cancelled Upload Custom Mod to Server",
				});
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
				await readPermission(interaction.user, server.id),
				PermissionFlags.upload,
			)
		) {
			await thread.send(`The file will be added to the server shortly.`);
			const finalFilename = isFile
				? await copyLocalPluginFileToServer(
						server.config.pluginDir,
						messages,
					)
				: await downloadWebPluginFileToLocal(
						downloadingUrl,
						server.config.pluginDir,
						filename,
					);
			if (token) uploadserver.disposeToken(token);
			if (finalFilename) {
				await thread.send(`File \`${finalFilename}\` added to server.`);
			} else {
				await thread.send(
					`Failed to download the file, please check the URL or attachment.`,
				);
				changeCredit({
					userId: interaction.user.id,
					change: settings.uploadFileFee,
					serverId: server.id,
					reason: "Refund for failed to add uploaded Custom Mod to Server",
				});
				sendCreditNotification({
					user: interaction.user,
					creditChanged: settings.uploadFileFee,
					serverId: server.id,
					reason: "Refund for failed to add uploaded Custom Mod to Server",
				});
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
		for (const userId of await getUsersWithMatchedPermission(
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
							await readPermission(user, server.id),
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
						? await copyLocalPluginFileToServer(
								server.config.pluginDir,
								messages,
							)
						: await downloadWebPluginFileToLocal(
								downloadingUrl,
								server.config.pluginDir,
								filename,
							);
					if (token) uploadserver.disposeToken(token);
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
						changeCredit({
							userId: interaction.user.id,
							change: settings.uploadFileFee,
							serverId: server.id,
							reason: "Refund for failed to add uploaded Custom Mod to Server",
						});
						sendCreditNotification({
							user: interaction.user,
							creditChanged: settings.uploadFileFee,
							serverId: server.id,
							reason: "Refund for failed to add uploaded Custom Mod to Server",
						});
					}
				} else {
					if (token) uploadserver.disposeToken(token);
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
	permissions: anyPerm(
		PermissionFlags.downloadPlugin,
		PermissionFlags.voteDownloadPlugin,
		PermissionFlags.upload,
	),
	ephemeral: true,
} satisfies CommandFile<true>;
