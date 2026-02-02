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
import {
	createRequestComponent,
	RequestComponentId,
} from "../lib/component/request";
import {
	spendCredit,
	changeCredit,
	sendCreditNotification,
} from "../lib/credit";
import {
	anyPerm,
	comparePermission,
	getUsersWithMatchedPermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import type { FileBuffer } from "../lib/plugin/uploadServer/utils";
import { uploadServer } from "../lib/plugin/uploadServer";
import {
	copyLocalPluginFileToServer,
	downloadWebPluginFileToLocal,
} from "../lib/plugin/web";
import { UPLOAD_URL } from "../lib/env";

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
		const payment = await spendCredit(interaction, {
			userId: interaction.user.id,
			cost: server.creditSettings.uploadFileFee,
			reason: "Upload Custom Mod to Server",
			serverId: server.id,
		});
		if (!payment) {
			return await interaction.editReply({
				content: "Failed to upload mod to server",
			});
		}
		const thread = await interaction.channel.threads.create({
			name: "Upload File",
			invitable: false,
			type: ChannelType.PrivateThread,
			autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
			reason: `Upload file thread for ${interaction.user.tag}`,
			rateLimitPerUser: 10, // 10 seconds
		});

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
				filter: (i) => i.user.id === interaction.user.id,
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
		let token: string | null = null;
		if (UPLOAD_URL) {
			token = uploadServer.createFileToken();
			await thread.send(
				`You may also upload the file to [our website](${UPLOAD_URL}/?id=${token})`,
			);
			promises.push(uploadServer.awaitFileToken(token, 1000 * 60 * 30));
		}
		const cleanUp = () => {
			thread.delete().catch(() => {});
			interaction.deleteReply().catch(() => {});
		};
		const messages = await Promise.race(promises);
		if (messages instanceof ButtonInteraction) {
			await messages.reply("Upload cancelled.");
			await thread.setLocked(true);
			await thread.setArchived(true);
			if (token) uploadServer.disposeToken(token);
			changeCredit({
				userId: interaction.user.id,
				change: -payment.changed,
				reason: "Refund for cancelled Upload Custom Mod to Server",
				serverId: server.id,
			});
			sendCreditNotification({
				user: interaction.user,
				creditChanged: -payment.changed,
				reason: "Refund for cancelled Upload Custom Mod to Server",
				serverId: server.id,
			});
			setTimeout(cleanUp, 1000 * 10);
			return;
		}
		let downloadingUrl: string;
		let filename: string;
		const isFileBuffer = "filename" in messages;
		if (isFileBuffer) {
			downloadingUrl = `${UPLOAD_URL}/file/${token}`;
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
					change: -payment.changed,
					serverId: server.id,
					reason: "Refund for cancelled Upload Custom Mod to Server",
				});
				sendCreditNotification({
					user: interaction.user,
					creditChanged: -payment.changed,
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
			const finalFilename = isFileBuffer
				? await copyLocalPluginFileToServer(
						server.config.pluginDir,
						messages,
					)
				: await downloadWebPluginFileToLocal(
						downloadingUrl,
						server.config.pluginDir,
						filename,
					);
			if (token) uploadServer.disposeToken(token);
			if (finalFilename) {
				await thread.send(`File \`${finalFilename}\` added to server.`);
			} else {
				await thread.send(
					`Failed to download the file, please check the URL or attachment.`,
				);
				changeCredit({
					userId: interaction.user.id,
					change: -payment.changed,
					serverId: server.id,
					reason: "Refund for failed to add uploaded Custom Mod to Server",
				});
				sendCreditNotification({
					user: interaction.user,
					creditChanged: -payment.changed,
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
		const message = await thread.send({
			content: "Approve this file?",
			components: [createRequestComponent()],
		});
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
			.createMessageComponentCollector({
				filter: async (interaction) =>
					!interaction.user.bot &&
					comparePermission(
						await readPermission(interaction.user, server.id),
						PermissionFlags.downloadPlugin,
					),
				max: 1,
				time: 1000 * 60 * 10, // 10 minutes
			})
			.on("collect", async (messageInteraction) => {
				message.edit({ components: [] }).catch(() => {});
				if (messageInteraction.customId === RequestComponentId.Allow) {
					await messageInteraction.reply(
						`File approved by ${userMention(interaction.user.id)}.`,
					);
					await thread.send(
						"The file will be added to the server shortly.",
					);
					const finalFilename = isFileBuffer
						? await copyLocalPluginFileToServer(
								server.config.pluginDir,
								messages,
							)
						: await downloadWebPluginFileToLocal(
								downloadingUrl,
								server.config.pluginDir,
								filename,
							);
					if (token) uploadServer.disposeToken(token);
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
							change: -payment.changed,
							serverId: server.id,
							reason: "Refund for failed to add uploaded Custom Mod to Server",
						});
						sendCreditNotification({
							user: interaction.user,
							creditChanged: -payment.changed,
							serverId: server.id,
							reason: "Refund for failed to add uploaded Custom Mod to Server",
						});
					}
				} else {
					if (token) uploadServer.disposeToken(token);
					await messageInteraction.reply(
						`File rejected by ${userMention(interaction.user.id)}.`,
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
