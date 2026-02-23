import { userMention } from "discord.js";
import type { Approval, CoreApproval } from "../approval";

export function createUserMentions(ids: string[]) {
	const counter: Record<string, number> = {};
	for (const id of ids) {
		if (counter[id]) {
			counter[id]++;
		} else {
			counter[id] = 1;
		}
	}
	const mentions = [];
	for (const [id, val] of Object.entries(counter)) {
		if (val > 1) {
			mentions.push(`${userMention(id)} x${val}`);
		} else {
			mentions.push(userMention(id));
		}
	}
	return mentions.join(", ");
}

export function getUserApprovedCount(approval: CoreApproval, userId: string) {
	return (
		approval.approvalIds.filter((id) => id === userId).length +
		approval.disapprovalIds.filter((id) => id === userId).length
	);
}

export function removeUserFromApproval(
	approval: CoreApproval,
	userId: string,
	removeFrom?: "approval" | "disapproval",
) {
	if (!removeFrom || removeFrom === "approval")
		approval.approvalIds = approval.approvalIds.filter(
			(id) => id !== userId,
		);
	if (!removeFrom || removeFrom === "disapproval")
		approval.disapprovalIds = approval.disapprovalIds.filter(
			(id) => id !== userId,
		);
}

export function isUserVoted(approval: CoreApproval, userId: string) {
	return (
		approval.approvalIds.includes(userId) ||
		approval.disapprovalIds.includes(userId)
	);
}

export function createApprovalResultString(approval: Approval, approving: boolean) {
	return approving
		? `${approval.approvalIds.length}/${approval.options.approvalCount}`
		: `${approval.disapprovalIds.length}/${approval.options.disapprovalCount}`
}