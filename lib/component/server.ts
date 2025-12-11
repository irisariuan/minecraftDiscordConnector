import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import type { TagPair } from "../server";
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
