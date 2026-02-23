import { ComponentType, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	createRequestComponent,
	RequestComponentId,
} from "../lib/component/request";
import { refundCredit, spendCredit } from "../lib/credit";
import {
	orPerm,
	comparePermission,
	PermissionFlags,
	readPermission,
} from "../lib/permission";
import { removePluginByFileName } from "../lib/serverInstance/plugin";

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
		const plugin = interaction.options.getString("plugin", true);
		const deleteFunc = async () => {
			if (await removePluginByFileName(server.config.pluginDir, plugin)) {
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
				await readPermission(interaction.user, server.id),
				PermissionFlags.deletePlugin,
			)
		)
			return await deleteFunc();
		const payment = await spendCredit(interaction.channel, {
			user: interaction.user,
			cost: server.creditSettings.deletePluginFee,
			reason: `Delete Plugin ${plugin}`,
			serverId: server.id,
		});
		if (!payment) {
			return await interaction.editReply({
				content: `Failed to delete a plugin. Deleting a plugin costs ${server.creditSettings.deletePluginFee} credits.`,
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
						await readPermission(i.user, server.id),
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
			await refundCredit({
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
	permissions: orPerm(
		PermissionFlags.deletePlugin,
		PermissionFlags.voteDeletePlugin,
	),
} satisfies CommandFile<true>;
