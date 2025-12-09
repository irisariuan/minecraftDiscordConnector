import { EmbedBuilder, time } from "discord.js";
import {
	type CoreApproval,
	type ApprovalOptions,
	type Approval,
	checkApprovalStatus,
} from "../approval";
import { createUserMentions } from "../approval/utils";

export function createInternalApprovalEmbed(
	approval: CoreApproval & {
		options: Pick<
			ApprovalOptions,
			"description" | "approvalCount" | "disapprovalCount"
		>;
	},
	color: number,
	title: string,
) {
	const approvalCount = approval.options.approvalCount;
	const disapprovalCount = approval.options.disapprovalCount;
	return new EmbedBuilder()
		.setColor(color)
		.setTitle(title)
		.setDescription(approval.options.description)
		.addFields(
			{
				name: "Approval Count",
				value: `${approval.approvalIds.length}/${approvalCount} (${createUserMentions(approval.approvalIds)})`,
			},
			{
				name: "Disapproval Count",
				value: `${approval.disapprovalIds.length}/${disapprovalCount} (${createUserMentions(approval.disapprovalIds)})`,
			},
			{ name: "Valid Till", value: time(new Date(approval.validTill)) },
		)
		.setTimestamp(Date.now())
		.setFooter({ text: "Approval System" });
}

export function createApprovalEmbed(approval: Approval) {
	switch (checkApprovalStatus(approval)) {
		case "pending": {
			return createInternalApprovalEmbed(approval, 0x0099ff, "Pending");
		}
		case "approved": {
			return createInternalApprovalEmbed(
				approval,
				0x00ff00,
				approval.superStatus === "approved"
					? "Approved (Force)"
					: "Approved",
			);
		}
		case "disapproved": {
			return createInternalApprovalEmbed(
				approval,
				0xff0000,
				approval.superStatus === "disapproved"
					? "Disapproved (Force)"
					: "Disapproved",
			);
		}
		case "timeout": {
			return createInternalApprovalEmbed(approval, 0xff0000, "Timeout");
		}
	}
}
