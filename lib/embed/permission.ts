import {
	ActionRowBuilder,
	ButtonBuilder,
	StringSelectMenuBuilder,
} from "discord.js";
import { PermissionFlags } from "../permission";

export enum PermissionSelectionMenu {
	PERMISSION_SELECT_ID = "permission_select",
	PERMISSION_RESET_ID = "permission_reset",
}
export function createPermissionSelectionMenu(page = 0) {
	const options = Object.entries(PermissionFlags).slice(
		page,
		(page + 1) * 25,
	);
	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId(PermissionSelectionMenu.PERMISSION_SELECT_ID)
		.setPlaceholder("Select a Permission")
		.addOptions(
			options.map(([name, value]) => ({
				label: name.toUpperCase(),
				value: value.toString(),
			})),
		)
		.setMaxValues(Math.min(options.length, 25));
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		selectMenu,
	);
}
export function createPermissionResetButton() {
	const button = new ButtonBuilder()
		.setCustomId(PermissionSelectionMenu.PERMISSION_RESET_ID)
		.setLabel("Reset Permissions")
		.setStyle(4);
	return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}
