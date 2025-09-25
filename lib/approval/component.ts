import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle, ModalBuilder } from "discord.js";

export const BaseApprovalComponentId = "APPROVAL_";
export enum ApprovalComponentId {
	Approve = "APPROVAL_APPROVE",
	SuperApprove = "APPROVAL_SUPER_APPROVE",
	SuperReject = "APPROVAL_SUPER_REJECT",
	Reject = "APPROVAL_REJECT",
	Revoke = "APPROVAL_REVOKE",
}
export function createApprovalComponent({
	showRevoke = true,
	showSuperOptions = false,
	showApprove = true,
	showReject = true,
}: {
	showRevoke?: boolean;
	showSuperOptions?: boolean;
	showApprove?: boolean;
	showReject?: boolean;
} = {}) {
	const approveBtn = new ButtonBuilder()
		.setCustomId(ApprovalComponentId.Approve)
		.setLabel("Approve")
		.setStyle(ButtonStyle.Primary);
	const rejectBtn = new ButtonBuilder()
		.setCustomId(ApprovalComponentId.Reject)
		.setLabel("Reject")
		.setStyle(ButtonStyle.Danger);
	const revokeBtn = new ButtonBuilder()
		.setCustomId(ApprovalComponentId.Revoke)
		.setLabel("Revoke")
		.setStyle(ButtonStyle.Secondary);
	const superApproveBtn = new ButtonBuilder()
		.setCustomId(ApprovalComponentId.SuperApprove)
		.setLabel("Super Approve")
		.setStyle(ButtonStyle.Success);
	const superRejectBtn = new ButtonBuilder()
		.setCustomId(ApprovalComponentId.SuperReject)
		.setLabel("Super Reject")
		.setStyle(ButtonStyle.Danger);
	const actionRow = new ActionRowBuilder<ButtonBuilder>();
	if (showApprove) actionRow.addComponents(approveBtn);
	if (showReject) actionRow.addComponents(rejectBtn);
	if (showSuperOptions) {
		if (showApprove) actionRow.addComponents(superApproveBtn);
		if (showReject) actionRow.addComponents(superRejectBtn);
	}
	if (showRevoke) actionRow.addComponents(revokeBtn);
	return actionRow;
}

export function parseApprovalId(customId: ApprovalComponentId) {
	return {
		approveVote:
			customId === ApprovalComponentId.Approve ||
			customId === ApprovalComponentId.SuperApprove,
		superVote:
			customId === ApprovalComponentId.SuperApprove ||
			customId === ApprovalComponentId.SuperReject,
		rejectVote:
			customId === ApprovalComponentId.Reject ||
			customId === ApprovalComponentId.SuperReject,
		revokeVote: customId === ApprovalComponentId.Revoke,
	};
}
