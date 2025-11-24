import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import type { TagPair } from "../server";

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
				label: option.tag ?? option.id.toString(),
				value: option.id.toString(),
			})),
		);
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		selectMenu,
	);
}
