import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";

export enum ApprovalMessageComponentId {
	Approve = "APPROVAL_APPROVE",
	SuperApprove = "APPROVAL_SUPER_APPROVE",
	SuperReject = "APPROVAL_SUPER_REJECT",
	Reject = "APPROVAL_REJECT",
	Revoke = "APPROVAL_REVOKE",
}

export function isApprovalMessageComponentId(customId: string) {
	return Object.values(ApprovalMessageComponentId).includes(
		customId as ApprovalMessageComponentId,
	);
}

export function createApprovalMessageComponent({
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
		.setCustomId(ApprovalMessageComponentId.Approve)
		.setLabel("Approve")
		.setStyle(ButtonStyle.Primary);
	const rejectBtn = new ButtonBuilder()
		.setCustomId(ApprovalMessageComponentId.Reject)
		.setLabel("Reject")
		.setStyle(ButtonStyle.Danger);
	const revokeBtn = new ButtonBuilder()
		.setCustomId(ApprovalMessageComponentId.Revoke)
		.setLabel("Revoke")
		.setStyle(ButtonStyle.Secondary);
	const superApproveBtn = new ButtonBuilder()
		.setCustomId(ApprovalMessageComponentId.SuperApprove)
		.setLabel("Super Approve")
		.setStyle(ButtonStyle.Success);
	const superRejectBtn = new ButtonBuilder()
		.setCustomId(ApprovalMessageComponentId.SuperReject)
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

export function parseApprovalComponentId(customId: ApprovalMessageComponentId) {
	return {
		approveVote:
			customId === ApprovalMessageComponentId.Approve ||
			customId === ApprovalMessageComponentId.SuperApprove,
		superVote:
			customId === ApprovalMessageComponentId.SuperApprove ||
			customId === ApprovalMessageComponentId.SuperReject,
		rejectVote:
			customId === ApprovalMessageComponentId.Reject ||
			customId === ApprovalMessageComponentId.SuperReject,
		revokeVote: customId === ApprovalMessageComponentId.Revoke,
	};
}
