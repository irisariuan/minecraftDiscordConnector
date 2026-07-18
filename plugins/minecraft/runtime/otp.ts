import { ActionRowBuilder } from "@discordjs/builders";
import {
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	LabelBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";

export enum OTPAction {
	OTP_SHOW_MODAL_BUTTON = "otp_click",
	OTP_MODAL_SUBMIT_BUTTON = "otp_submit",
	OTP_MODAL = "otp_modal",
	OTP_TEXT_INPUT = "otp_text_input",
}

export function createOtpButtonRow() {
	const button = new ButtonBuilder()
		.setCustomId(OTPAction.OTP_SHOW_MODAL_BUTTON)
		.setLabel("OTP")
		.setStyle(ButtonStyle.Primary);
	return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

export function createOtpInputModal() {
	const textInput = new TextInputBuilder()
		.setMaxLength(6)
		.setMinLength(6)
		.setId(1)
		.setCustomId(OTPAction.OTP_TEXT_INPUT)
		.setStyle(TextInputStyle.Short)
		.setRequired(true);
	const label = new LabelBuilder()
		.setLabel("Input OTP")
		.setDescription("Enter the OTP you received in the game")
		.setTextInputComponent(textInput);
	const modal = new ModalBuilder()
		.setCustomId(OTPAction.OTP_MODAL)
		.setTitle("OTP")
		.addLabelComponents(label);
	return modal;
}

/**
 * Lookup Minecraft player profile by UUID or Player name using Minecraft Services API
 * @param identifier UUID or Player name
 */
export async function lookupPlayerByIdentifier(identifier: string) {
	const res = await fetch(
		"https://api.minecraftservices.com/minecraft/profile/lookup/" +
			identifier,
	);
	if (!res.ok) return null;
	const data = await res.json().catch(() => null);
	if (!data || !data.id || !data.name) return null;
	return data as { id: string; name: string };
}
