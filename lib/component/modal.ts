import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	LabelBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	CommandInteraction,
	ButtonInteraction,
	ModalSubmitInteraction,
	MessageFlags,
} from "discord.js";

export enum ModalComponentId {
	UseDefault = "modal_use_default",
	Customize = "modal_customize",
	EditBtn = "modal_edit_btn",
	Modal = "modal_base",
	Input = "modal_input",
}

/**
 * Build a modal pre-filled with the given script content.
 */
export function buildModal(
	currentContent?: string,
	title = "Edit startup script",
): ModalBuilder {
	const modal = new ModalBuilder()
		.setCustomId(ModalComponentId.Modal)
		.setTitle(title);
	const input = new TextInputBuilder()
		.setCustomId(ModalComponentId.Input)
		.setStyle(TextInputStyle.Paragraph)
		.setValue(currentContent?.slice(0, 4000) ?? "")
		.setMaxLength(4000)
		.setRequired(true);
	const label = new LabelBuilder()
		.setLabel("Edit Content")
		.setDescription(
			"This script will be run every time the server starts, under bash environment",
		)
		.setTextInputComponent(input);

	modal.addLabelComponents(label);

	return modal;
}

/**
 * "✅ Use default" + "✏️ Customize" row.
 * Shown when previewing the startup script during server creation.
 */
export function buildModalPromptRow(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(ModalComponentId.UseDefault)
			.setLabel("Use default")
			.setStyle(ButtonStyle.Success)
			.setEmoji("✅"),
		new ButtonBuilder()
			.setCustomId(ModalComponentId.Customize)
			.setLabel("Customize")
			.setStyle(ButtonStyle.Secondary)
			.setEmoji("✏️"),
	);
}

/**
 * Single "✏️ Edit script content" button row.
 * Shown after a server-edit operation succeeds.
 */
export function buildEditModalContentRow(label = "Edit script content"): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(ModalComponentId.EditBtn)
			.setLabel(label)
			.setStyle(ButtonStyle.Secondary)
			.setEmoji("✏️"),
	);
}

/**
 * Show the modal in response to a button click and collect
 * the submitted content.
 *
 * Internally calls `deferReply()` on the modal submit so the calling code
 * can continue editing the original reply via `interaction.editReply()`.
 *
 * @returns The submitted string, or `null` if the user did not
 *          respond within `timeoutMs`.
 */
export async function collectInputFromModal(
	interaction: CommandInteraction | ButtonInteraction,
	defaultContent?: string,
	timeoutMs = 1000 * 60 * 5,
): Promise<
	| { content: string; interaction: ModalSubmitInteraction }
	| {
			content: null;
			interaction: null;
	  }
> {
	await interaction.showModal(buildModal(defaultContent));

	const submit = await interaction
		.awaitModalSubmit({
			filter: (i) =>
				i.user.id === interaction.user.id &&
				i.customId === ModalComponentId.Modal,
			time: timeoutMs,
		})
		.catch(() => null);

	if (!submit)
		return {
			content: null,
			interaction: null,
		};

	await submit.deferReply({ flags: MessageFlags.Ephemeral });

	return {
		content: submit.fields.getTextInputValue(ModalComponentId.Input),
		interaction: submit,
	};
}
