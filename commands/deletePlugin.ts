import { ComponentType, SlashCommandBuilder } from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import { removePluginByFileName } from "../lib/plugin";
import {
	comparePermission,
	readPermission,
	PermissionFlags,
	anyPerm,
} from "../lib/permission";
import { createRequestComponent, RequestComponentId } from "../lib/components";
import {
	changeCredit,
	sendCreditNotification,
	spendCredit,
} from "../lib/credit";
import { settings } from "../lib/settings";

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
				await readPermission(interaction.user),
				PermissionFlags.deletePlugin,
			)
		)
			return await deleteFunc();
		if (
			!(await spendCredit({
				userId: interaction.user.id,
				cost: settings.deletePluginFee,
				reason: "Delete Plugin Request",
				serverId: server.id,
			}))
		) {
			return await interaction.editReply({
				content: `You don't have enough credit to delete a plugin. Deleting a plugin costs ${settings.deletePluginFee} credits.`,
			});
		}

		await sendCreditNotification({
			user: interaction.user,
			creditChanged: -settings.deletePluginFee,
			reason: "Delete Plugin Request",
			serverId: server.id,
		});

		const message = await interaction.editReply({
			content: `Please ask a staff to permit your request on deleting \`${plugin}\``,
			components: [createRequestComponent()],
		});
		const reply = await message
			.awaitMessageComponent({
				filter: async (i) =>
					comparePermission(
						await readPermission(i.user),
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
			await changeCredit({
				userId: interaction.user.id,
				change: settings.deletePluginFee,
				serverId: server.id,
				reason: "Delete Plugin Request Denied Refund",
			});
			await sendCreditNotification({
				user: interaction.user,
				creditChanged: settings.deletePluginFee,
				reason: "Delete Plugin Request Denied Refund",
				serverId: server.id,
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
	permissions: anyPerm(
		PermissionFlags.deletePlugin,
		PermissionFlags.voteDeletePlugin,
	),
} satisfies CommandFile<true>;
