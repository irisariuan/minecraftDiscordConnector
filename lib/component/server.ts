import {
	ActionRowBuilder,
	ChatInputCommandInteraction,
	ComponentType,
	MessageFlags,
	StringSelectMenuBuilder,
	type InteractionReplyOptions,
} from "discord.js";
import type { Server, ServerManager, TagPair } from "../server";
import { trimTextWithSuffix } from "../utils";

export enum ServerSelectionMenuAction {
	SERVER_SELECT_ID = "server_select",
}
export function createServerSelectionMenu(options: TagPair[]) {
	options = options.slice(0, 25); // Discord limit
	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId(ServerSelectionMenuAction.SERVER_SELECT_ID)
		.setPlaceholder("Select a server")
		.addOptions(
			options.map((option) => ({
				label: trimTextWithSuffix(
					trimTextWithSuffix(option.tag ?? option.id.toString(), 100),
					25,
				),
				value: option.id.toString(),
			})),
		);
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		selectMenu,
	);
}
export async function getUserSelectedServer(
	serverManager: ServerManager,
	interaction: ChatInputCommandInteraction,
	ephemeral: boolean,
): Promise<Server | null> {
	const serverCount = serverManager.getServerCount();
	if (serverCount === 0) {
		if (interaction.replied) {
			const followUp = await interaction.followUp({
				content: "No servers available",
			});
			setTimeout(() => {
				followUp.delete().catch(() => {});
			}, 1000 * 5);
			return null;
		}
		await interaction.reply({
			content: "No servers available",
			flags: [MessageFlags.Ephemeral],
		});
		return null;
	}
	if (serverCount === 1) {
		const servers = serverManager.getAllServerEntries();
		if (!servers[0]) {
			if (interaction.replied) {
				const followUp = await interaction.followUp({
					content: "No servers available",
				});
				setTimeout(() => {
					followUp.delete().catch(() => {});
				}, 1000 * 5);
				return null;
			}
			await interaction.reply({
				content: "No servers available",
				flags: [MessageFlags.Ephemeral],
			});
			return null;
		}
		if (!interaction.deferred)
			await interaction.deferReply({
				flags: ephemeral ? [MessageFlags.Ephemeral] : [],
			});
		return servers[0][1];
	} else {
		const content = {
			content: "Please select a server:",
			components: [
				createServerSelectionMenu(serverManager.getAllTagPairs()),
			],
		};
		const contentWithFlags: InteractionReplyOptions = {
			...content,
			flags: ephemeral ? [MessageFlags.Ephemeral] : [],
		};
		const reply = interaction.replied
			? await interaction.followUp(contentWithFlags)
			: interaction.deferred
				? await interaction.editReply(content)
				: await interaction.reply(contentWithFlags);
		try {
			const selection = await reply.awaitMessageComponent({
				time: 60000,
				filter: (i) => i.user.id === interaction.user.id,
				componentType: ComponentType.StringSelect,
			});
			const serverId = selection.values[0];
			if (!serverId) {
				await selection.update({
					content: "No server selected",
					components: [],
				});
				return null;
			}
			const selectedServer = serverManager.getServer(parseInt(serverId));
			if (!selectedServer) {
				await selection.update({
					content: "Selected server not found",
					components: [],
				});
				return null;
			}
			await selection.update({
				content: "Loading...",
				components: [],
			});
			const followUp = await selection.followUp({
				content: `Selected ${selectedServer.config.tag || `*Server #${selectedServer.id}*`}`,
				flags: ephemeral ? [MessageFlags.Ephemeral] : [],
			});
			setTimeout(() => {
				followUp.delete().catch(() => {});
			}, 1000 * 5);
			return selectedServer;
		} catch (e) {
			await interaction.editReply({
				content: "No server selected in time or an error occurred",
				components: [],
			});
			return null;
		}
	}
}
