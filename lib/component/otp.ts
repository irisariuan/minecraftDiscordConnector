import { ActionRowBuilder } from "@discordjs/builders";
import {
	ButtonBuilder,
	ButtonStyle,
	type Client,
	ComponentType,
	LabelBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";

/**
 * The one-time code exchange, and the Discord side of it.
 *
 * A code proves a link because it crosses a gap nobody but the right person can
 * cross: it appears in one place and has to be typed in another. Which of the
 * two places is which depends on who started — a `/link` on Discord has the code
 * delivered in game, and a `/link` typed in game has it shown there instead —
 * but the shape is the same either way, so the components are shared.
 */

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

/** How long a direct-message code stays good for, matching the Discord `/link`. */
export const OTP_DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export type ConfirmOtpResult = {
	status: "confirmed" | "unreachable" | "timeout";
};

/**
 * Message a Discord user and wait for them to type `otp` back.
 *
 * This is the half of the exchange that belongs to somebody who started the
 * other half in game, where there is no interaction to reply to and no slash
 * command to hang the collector off. The direct message is both: it reaches the
 * account being claimed, and only the person holding it can answer.
 *
 * A wrong code is not the end of the attempt — people mistype — so the prompt
 * stays open until it is right or until the wait runs out. Returning
 * `unreachable` rather than throwing keeps a closed inbox, which is common and
 * is nobody's fault, distinguishable from a failure worth logging.
 */
export async function confirmOtpByDm(
	client: Client,
	{
		discordId,
		otp,
		content,
		timeoutMs = OTP_DEFAULT_TIMEOUT_MS,
	}: {
		discordId: string;
		otp: string;
		content: string;
		timeoutMs?: number;
	},
): Promise<ConfirmOtpResult> {
	const user = await client.users.fetch(discordId).catch(() => null);
	if (!user) return { status: "unreachable" };

	const dm = await user
		.send({ content, components: [createOtpButtonRow()] })
		.catch(() => null);
	if (!dm) return { status: "unreachable" };

	return await new Promise<ConfirmOtpResult>((resolve) => {
		const collector = dm.createMessageComponentCollector({
			componentType: ComponentType.Button,
			filter: (i) =>
				i.user.id === discordId &&
				i.customId === OTPAction.OTP_SHOW_MODAL_BUTTON,
			time: timeoutMs,
		});
		let confirmed = false;

		collector.on("collect", async (button) => {
			await button.showModal(createOtpInputModal());
			const submission = await button
				.awaitModalSubmit({
					time: timeoutMs,
					filter: (i) =>
						i.user.id === discordId &&
						i.customId === OTPAction.OTP_MODAL,
				})
				.catch(() => null);
			if (!submission) return;

			const entered = submission.fields
				.getTextInputValue(OTPAction.OTP_TEXT_INPUT)
				.trim();
			if (entered !== otp) {
				await submission
					.reply("That code does not match. Check the one in game and try again.")
					.catch(() => {});
				return;
			}

			confirmed = true;
			collector.stop("confirmed");
			await submission
				.reply("Confirmed! You can go back to the game.")
				.catch(() => {});
			await dm.edit({ components: [] }).catch(() => {});
			resolve({ status: "confirmed" });
		});

		collector.on("end", () => {
			if (confirmed) return;
			dm.edit({
				content: `${content}\n\n*This request has expired.*`,
				components: [],
			}).catch(() => {});
			resolve({ status: "timeout" });
		});
	});
}

/**
 * Find the Discord user somebody named, by username or by raw user id.
 *
 * Exact matches only. A player typing a name they half remember should be told
 * it was not found, not linked to whoever came closest — the whole value of the
 * link is that it names the right person.
 *
 * Usernames are unique across Discord, but nothing exposes a global lookup by
 * one, so this searches the guilds the bot is in. A user the bot shares no guild
 * with cannot be found, which is the right answer anyway: the bot would have no
 * way to message them.
 */
export async function findDiscordUser(client: Client, query: string) {
	const wanted = query.trim().replace(/^@/, "");
	if (!wanted) return null;

	if (/^\d{15,25}$/.test(wanted)) {
		const byId = await client.users.fetch(wanted).catch(() => null);
		if (byId) return { id: byId.id, username: byId.username };
	}

	for (const guild of client.guilds.cache.values()) {
		const members = await guild.members
			.search({ query: wanted, limit: 10 })
			.catch(() => null);
		if (!members) continue;
		for (const member of members.values()) {
			if (member.user.username.toLowerCase() === wanted.toLowerCase()) {
				return { id: member.id, username: member.user.username };
			}
		}
	}
	return null;
}
