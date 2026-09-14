import { ComponentType, SlashCommandBuilder } from "discord.js";
import {
	comparePermission,
	createRequestComponent,
	data,
	orPerm,
	PermissionFlags,
	RequestComponentId,
	type CommandFile,
} from "../../api";
import type { MinecraftConfig } from "../config";
import { removePluginByFileName } from "../runtime/pluginDir";

export default {
	command: new SlashCommandBuilder()
		.setName("deleteplugin")
		.setDescription("Delete a plugin from the server")
		.addStringOption((option) =>
			option
				.setName("plugin")
				.setDescription("The plugin to delete")
				.setRequired(true),
		),
	requireServer: true,
	async execute({ interaction, server }) {
		const { pluginDir } = server.getPluginConfig() as unknown as MinecraftConfig;
		const plugin = interaction.options.getString("plugin", true);
		const deleteFunc = async () => {
			if (await removePluginByFileName(pluginDir, plugin)) {
				await interaction.editReply({
					content: `Plugin \`${plugin}\` deleted successfully.`,
					components: [],
				});
			} else {
				await interaction.editReply({
					content: `Plugin \`${plugin}\` not found.`,
					components: [],
				});
			}
		};
		if (
			comparePermission(
				await data.request("permission:read", {
					user: interaction.user,
					serverId: server.id,
				}),
				PermissionFlags.deletePlugin,
			)
		)
			return await deleteFunc();
		const payment = await data.request("credit:spend", {
			user: interaction.user,
			channel: interaction.channel,
			cost: server.settings.deletePluginFee,
			reason: `Delete Plugin ${plugin}`,
			serverId: server.id,
		});
		if (!payment) {
			return await interaction.editReply({
				content: `Failed to delete plugin`,
			});
		}

		const message = await interaction.editReply({
			content: `Please ask a staff to permit your request on deleting \`${plugin}\``,
			components: [createRequestComponent()],
		});
		const reply = await message
			.awaitMessageComponent({
				filter: async (i) =>
					comparePermission(
						await data.request("permission:read", {
							user: i.user,
							serverId: server.id,
						}),
						PermissionFlags.deletePlugin,
					),
				componentType: ComponentType.Button,
				time: 15 * 60 * 1000,
			})
			.catch(() => null);
		if (!reply) {
			return await interaction.editReply({
				content: "Request timed out.",
				components: [],
			});
		}
		if (reply.customId === RequestComponentId.Deny) {
			await data.request("credit:refund", {
				user: interaction.user,
				creditChanged: -payment.changed,
				serverId: server.id,
				reason: "Delete Plugin Request Denied Refund",
			});
			return await interaction.editReply({
				content: "Request denied.",
				components: [],
			});
		}
		await interaction.editReply({
			content: `Your request to delete \`${plugin}\` has been approved. Deleting...`,
			components: [],
		});
		return await deleteFunc();
	},
	features: {
		requireStoppedServer: true,
	},
	permissions: orPerm(
		PermissionFlags.deletePlugin,
		PermissionFlags.voteDeletePlugin,
	),
} satisfies CommandFile<true>;
