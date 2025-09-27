import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export enum RequestComponentId {
	Allow = "REQUEST_APPROVE",
	Deny = "REQUEST_DENY",
	Cancel = "REQUEST_CANCEL",
}

export function createRequestComponent({
	showDeny = true,
	showAllow = true,
	showCancel = false,
}: {
	showDeny?: boolean;
	showAllow?: boolean;
	showCancel?: boolean;
} = {}) {
	const builder = new ActionRowBuilder<ButtonBuilder>();
	if (showAllow)
		builder.addComponents(
			new ButtonBuilder()
				.setLabel("Allow")
				.setStyle(ButtonStyle.Success)
				.setCustomId(RequestComponentId.Allow),
		);
	if (showDeny)
		builder.addComponents(
			new ButtonBuilder()
				.setLabel("Deny")
				.setStyle(ButtonStyle.Danger)
				.setCustomId(RequestComponentId.Deny),
		);
	if (showCancel)
		builder.addComponents(
			new ButtonBuilder()
				.setLabel("Cancel")
				.setStyle(ButtonStyle.Secondary)
				.setCustomId(RequestComponentId.Cancel),
		);
	return builder;
}
