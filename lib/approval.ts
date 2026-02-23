import {
	ButtonInteraction,
	ComponentType,
	EmbedBuilder,
	MessageFlags,
	User,
	userMention,
	type CommandInteraction,
	type Message,
	type PartialMessage,
} from "discord.js";
import {
	ApprovalMessageComponentId,
	createApprovalMessageComponent,
	parseApprovalComponentId,
} from "./component/approval";
import { spendCredit, refundCredit, type PartialTransaction } from "./credit";
import {
	compareAnyPermissions,
	comparePermission,
	PermissionFlags,
	readPermission,
} from "./permission";
import type { Server, ServerManager } from "./server";
import { resolve, type PickAndOptional, type Resolvable } from "./utils";
import {
	createInternalApprovalEmbed,
	createApprovalEmbed,
} from "./embed/approval";
import { APPROVAL_TIMEOUT } from "./env";
import {
	createApprovalResultString,
	isUserVoted,
	removeUserFromApproval,
} from "./approval/utils";

/**
 * All core components needed for the approval system to work
 */
export interface CoreApproval {
	content: string;
	validTill: number;
	duration: number;
	approvalIds: string[];
	transactions: PartialTransaction[];
	disapprovalIds: string[];
	server: Server;
}

export interface Approval extends CoreApproval {
	superStatus: ApprovalStatus.Approved | ApprovalStatus.Disapproved | null;
	createdAt: number;
	options: ApprovalOptions;
	message: Message | PartialMessage;
	originalMessageId: string;
	timeout: NodeJS.Timeout;
	updateInterval?: NodeJS.Timeout;
	/**
	 * @description Run before the approval is removed
	 */
	cleanUp: () => unknown | Promise<unknown>;
}

export interface ApprovalOptions {
	description: string;
	approvalCount: number;
	disapprovalCount: number;
	requireSuperApproval?: boolean;
	callerId: string;
	startPollFee?: number;
	credit?: number;
	onSuccess: (
		approval: Approval,
		message: Message | PartialMessage,
	) => unknown;
	onFailure?: (
		approval: Approval,
		message: Message | PartialMessage,
	) => unknown;
	onTimeout?: (
		approval: Approval,
		message: Message | PartialMessage,
	) => unknown;
	canRepeatApprove?: Resolvable<
		boolean,
		{ user: User; approval: Approval; server: Server }
	>;
}

export const MESSAGE_VALID_TIME = 14 * 60 * 1000; // 14 minutes, since discord message valid time is 15 minutes
export const DELETE_AFTER_MS = 3 * 1000;

function newApproval(
	approval: Omit<
		Approval,
		"approvalIds" | "disapprovalIds" | "timeout" | "superStatus" | "cleanUp"
	>,
	cleanUp: () => unknown | Promise<unknown>,
	update: () => unknown | Promise<unknown>,
) {
	const existingApproval = getApproval(approval.server, approval.message.id);
	if (existingApproval) {
		console.log(`Approval ${approval.message.id} already exists`);
		return existingApproval;
	}

	const timeoutCleanUpFunc = async () => {
		console.log(
			`Removing approval ${approval.message.id} (timeout/interval)`,
		);
		const fetchedApproval = getApproval(
			approval.server,
			approval.message.id,
			true,
		);
		if (!fetchedApproval)
			return console.log("Approval not found (timeout/interval)");
		await removeApproval(fetchedApproval);
	};

	const newApproval: Approval = {
		...approval,
		approvalIds: [],
		disapprovalIds: [],
		timeout: setTimeout(
			timeoutCleanUpFunc,
			approval.validTill - Date.now(),
		),
		superStatus: null,
		originalMessageId: approval.message.id,
		cleanUp,
	};
	if (approval.duration > MESSAGE_VALID_TIME) {
		newApproval.updateInterval = setInterval(() => {
			update();
			if (approval.validTill < Date.now()) {
				timeoutCleanUpFunc();
			}
		}, MESSAGE_VALID_TIME);
	}
	approval.server.approvalList.set(approval.message.id, newApproval);
	return newApproval;
}

function transferApproval(
	approval: Approval,
	newMessage: Message | PartialMessage,
) {
	console.log(
		`Transferring poll original: ${approval.originalMessageId}, last: ${approval.message.id}, now: ${newMessage.id}`,
	);
	const oldMessageId = approval.message.id;
	approval.message = newMessage;
	approval.server.approvalList.set(oldMessageId, approval);
	approval.server.approvalList.set(newMessage.id, approval);
}

function approve(
	server: Server,
	messageId: string,
	userId: string,
	force = false,
) {
	const approval = getApproval(server, messageId);
	if (!approval) return;
	approval.approvalIds.push(userId);
	if (force) {
		approval.superStatus = ApprovalStatus.Approved;
	}
	return checkApprovalStatus(approval);
}
function disapprove(
	server: Server,
	messageId: string,
	userId: string,
	force = false,
) {
	const approval = getApproval(server, messageId);
	if (!approval) return;
	approval.disapprovalIds.push(userId);
	if (force) {
		approval.superStatus = ApprovalStatus.Disapproved;
	}
	return checkApprovalStatus(approval);
}

async function removeApproval(approval: Approval) {
	console.log(`Removing approval ${approval.message.id}`);
	clearTimeout(approval.timeout);
	clearInterval(approval.updateInterval);
	await approval.cleanUp();
	approval.server.approvalList.delete(approval.message.id);
	for (const [
		id,
		fetchedApproval,
	] of approval.server.approvalList.entries()) {
		if (approval.originalMessageId === fetchedApproval.originalMessageId) {
			console.log(
				`Removing ${fetchedApproval.message.id}, linked to approval ${approval.message.id} (${approval.originalMessageId})`,
			);
			approval.server.approvalList.delete(id);
		}
	}
}

export enum ApprovalStatus {
	Approved = "approvalApproved",
	Disapproved = "approvalDisapproved",
	Pending = "approvalPending",
	Timeout = "approvalTimeout",
}

export function checkApprovalStatus(approval: Approval): ApprovalStatus {
	const approvalCount = approval.options.approvalCount;
	const disapprovalCount = approval.options.disapprovalCount;
	const requireSuperApproval = approval.options.requireSuperApproval ?? false;
	if (approval.validTill > Date.now()) {
		if (approval.superStatus) return approval.superStatus;
		if (
			approval.approvalIds.length >= approvalCount &&
			!requireSuperApproval
		)
			return ApprovalStatus.Approved;
		if (approval.disapprovalIds.length >= disapprovalCount)
			return ApprovalStatus.Disapproved;

		return ApprovalStatus.Pending;
	}
	return ApprovalStatus.Timeout;
}

export function getApproval(
	server: Server,
	messageId: string,
	forceReturn = false,
): Approval | null {
	const approval = server.approvalList.get(messageId);
	if (approval) {
		if (
			checkApprovalStatus(approval) !== ApprovalStatus.Pending &&
			!forceReturn
		)
			return null;
		return approval;
	}
	for (const [key, approval] of server.approvalList.entries()) {
		if (
			key === messageId ||
			approval.message.id === messageId ||
			approval.originalMessageId === messageId
		) {
			if (
				checkApprovalStatus(approval) !== ApprovalStatus.Pending &&
				!forceReturn
			)
				return null;
			return approval;
		}
	}
	return null;
}

export function buildInteractionFetcher(interaction: CommandInteraction) {
	return (embed: EmbedBuilder) =>
		interaction.followUp({
			embeds: [embed],
			components: [createApprovalMessageComponent()],
			withResponse: true,
		});
}

export async function sendApprovalPoll(
	fetchMessage: (embed: EmbedBuilder) => Promise<Message>,
	approvalOptions: PickAndOptional<
		Approval,
		"content" | "options" | "server",
		"duration"
	>,
) {
	const { content, options } = approvalOptions;
	const duration =
		approvalOptions.duration ||
		Number(APPROVAL_TIMEOUT) ||
		1000 * 60 * 60 * 2;
	const validTill = Date.now() + duration; // 2 hours
	const embed = createInternalApprovalEmbed(
		{
			content,
			duration,
			validTill,
			approvalIds: [],
			disapprovalIds: [],
			transactions: [],
			options,
			server: approvalOptions.server,
		},
		0x0099ff,
		"Pending",
	);
	const message = await fetchMessage(embed);
	newApproval(
		{
			createdAt: Date.now(),
			content,
			validTill,
			duration,
			options,
			message,
			transactions: [],
			originalMessageId: message.id,
			server: approvalOptions.server,
		},
		// clean up function
		async () => {
			console.log("Running user defined clean up function");
			const approval = getApproval(
				approvalOptions.server,
				message.id,
				true,
			);
			if (!approval)
				return console.error("Approval not found, failed to clean up");
			if (approval.message.editable) {
				await approval.message.edit({
					embeds: [createApprovalEmbed(approval)],
				});
				await approval.message.reactions.removeAll();
			}
		},
		// transferring function
		async () => {
			if (!message.id) return;
			const approval = getApproval(approvalOptions.server, message.id);
			if (!approval?.message.channel.isSendable()) return;
			if (approval.message.deletable) {
				approval.message.delete().catch(console.error);
			}
			const newMessage = await approval.message.channel
				.send({
					embeds: [createApprovalEmbed(approval)],
					components: [createApprovalMessageComponent()],
				})
				.catch(() => null);
			if (!newMessage) return;
			transferApproval(approval, newMessage);
		},
	);
}

export function findApproval(
	serverManager: ServerManager,
	id: string,
): { approval: Approval; server: Server } | null {
	for (const [_, server] of serverManager.getAllServerEntries()) {
		const approval = getApproval(server, id);
		if (approval) {
			return { approval, server };
		}
	}
	return null;
}

export async function updateApprovalMessage(
	serverManager: ServerManager,
	reaction: ButtonInteraction,
) {
	const result = findApproval(serverManager, reaction.message.id);
	if (!result) return;
	const { approval, server } = result;
	const userPerm = await readPermission(reaction.user, approval.server.id);

	let approving: boolean;
	let disapproving: boolean;

	let canceling: boolean;

	let superApprove: boolean;
	const canSuperApprove = comparePermission(
		userPerm,
		PermissionFlags.superApprove,
	);

	let paymentSkipped = false;
	let canRepeatApprove = comparePermission(
		userPerm,
		PermissionFlags.repeatApproval,
	);

	if (
		!compareAnyPermissions(userPerm, [
			PermissionFlags.approve,
			PermissionFlags.superApprove,
		])
	)
		return;
	const { approveVote, rejectVote, revokeVote } = parseApprovalComponentId(
		reaction.customId as ApprovalMessageComponentId,
	);
	await reaction.deferReply();
	// Ask for confirmation if super approve is possible
	if (canSuperApprove && (approveVote || rejectVote)) {
		const answer = await reaction.followUp({
			content: `Do you want to super ${approveVote ? "approve" : "reject"} this poll?`,
			components: [
				createApprovalMessageComponent({
					showSuperOptions: true,
					showApprove: approveVote,
					showReject: rejectVote,
				}),
			],
			flags: MessageFlags.Ephemeral,
		});
		const res = await answer
			.awaitMessageComponent({
				time: 10 * 1000,
				filter: (i) => i.user.id === reaction.user.id,
				componentType: ComponentType.Button,
			})
			.catch(() => null);
		await answer.delete().catch(() => {});
		if (!res || res.customId === ApprovalMessageComponentId.Revoke) {
			const followUp = await reaction.followUp({
				content: "Timeout or cancelled, no action taken",
				flags: MessageFlags.Ephemeral,
			});
			return setTimeout(
				() => followUp.delete().catch(console.error),
				DELETE_AFTER_MS,
			);
		}
		const final = parseApprovalComponentId(
			res.customId as ApprovalMessageComponentId,
		);
		approving = final.approveVote;
		superApprove = final.superVote;
		disapproving = final.rejectVote;
		canceling = final.revokeVote;
	} else {
		// Simple approve/reject/revoke flow
		approving = approveVote;
		disapproving = rejectVote;
		canceling = revokeVote;
		superApprove = false;
	}
	// Check for server suspension
	if (
		server.suspendingEvent.isSuspending() &&
		!comparePermission(userPerm, PermissionFlags.suspend)
	) {
		const followUp = reaction.followUp({
			content:
				"The server is currently suspended, you do not have permission to approve or disapprove",
			flags: MessageFlags.Ephemeral,
		});
		return setTimeout(
			() => followUp.then((msg) => msg.delete().catch(console.error)),
			DELETE_AFTER_MS,
		);
	}
	// Handle cancelation
	if (canceling) {
		const prevCount =
			approval.approvalIds.length + approval.disapprovalIds.length;
		removeUserFromApproval(approval, reaction.user.id);
		if (
			prevCount ===
			approval.approvalIds.length + approval.disapprovalIds.length
		) {
			const followUp = await reaction.followUp({
				content: `${userMention(reaction.user.id)}\nYou have not approved or disapproved this poll`,
				flags: MessageFlags.Ephemeral,
			});
			return setTimeout(
				() => followUp.delete().catch(console.error),
				DELETE_AFTER_MS,
			);
		}
		if (reaction.message.editable) {
			await reaction.message
				.edit({
					embeds: [createApprovalEmbed(approval)],
				})
				.catch(console.error);
		}
		// Refund credit if applicable
		if (approval.options.credit && !paymentSkipped) {
			const amount = approval.transactions
				.filter((c) => c.userId === reaction.user.id)
				.reduce((a, b) => a + b.changed, 0);
			await refundCredit({
				user: reaction.user,
				creditChanged: -amount,
				reason: "Approval Reaction Refund",
				silent: true,
				serverId: approval.server.id,
			});
			approval.transactions = approval.transactions.filter(
				(c) => c.userId !== reaction.user.id,
			);
		}
		const followUp = await reaction.followUp({
			content: `Cancelled by ${userMention(reaction.user.id)}`,
			flags: MessageFlags.Ephemeral,
		});
		return setTimeout(
			() => followUp.delete().catch(console.error),
			DELETE_AFTER_MS,
		);
		// Handle credit spending
	} else if (approval.options.credit && !paymentSkipped) {
		if (isUserVoted(approval, reaction.user.id)) {
			// approved/disapproved, check options.canRepeatApprove
			if (approval.options.canRepeatApprove) {
				canRepeatApprove = await resolve(
					approval.options.canRepeatApprove,
					{
						user: reaction.user,
						approval,
						server,
					},
				);
			}
		} else {
			// new approval/disapproval, spend credit
			const transaction = await spendCredit(reaction.channel, {
				user: reaction.user,
				cost: approval.options.credit,
				serverId: approval.server.id,
				reason: `Approval Poll Reaction: ${approval.content}`,
			});
			if (!transaction) {
				const followUp = await reaction.followUp({
					content: `You do not have enough credit to approve this poll`,
					flags: MessageFlags.Ephemeral,
				});
				return setTimeout(
					() => followUp.delete().catch(console.error),
					DELETE_AFTER_MS,
				);
			}
			approval.transactions.push(transaction);
		}
	}
	// Check if the user has already approved/disapproved (if repeat approval is not allowed)
	if (
		!canRepeatApprove &&
		approving &&
		approval.approvalIds.includes(reaction.user.id) &&
		!(superApprove && canSuperApprove)
	) {
		const followUp = await reaction.followUp({
			content: "You have already approved this poll",
			flags: MessageFlags.Ephemeral,
		});
		return setTimeout(
			() => followUp.delete().catch(console.error),
			DELETE_AFTER_MS,
		);
	}
	if (
		!canRepeatApprove &&
		disapproving &&
		approval.disapprovalIds.includes(reaction.user.id) &&
		!(superApprove && canSuperApprove)
	) {
		const followUp = await reaction.followUp({
			content: "You have already disapproved this poll",
			flags: MessageFlags.Ephemeral,
		});
		return setTimeout(
			() => followUp.delete().catch(console.error),
			DELETE_AFTER_MS,
		);
	}

	// Check if the user is already in the opposite list and remove them (if repeat approval is not allowed)
	if (
		!canRepeatApprove &&
		disapproving &&
		approval.approvalIds.includes(reaction.user.id) &&
		!(superApprove && canSuperApprove)
	) {
		removeUserFromApproval(approval, reaction.user.id, "approval");
	} else if (
		!canRepeatApprove &&
		approving &&
		approval.disapprovalIds.includes(reaction.user.id) &&
		!(superApprove && canSuperApprove)
	) {
		removeUserFromApproval(approval, reaction.user.id, "disapproval");
	}

	// Process the approval/disapproval
	const status = approving
		? approve(
				server,
				reaction.message.id,
				reaction.user.id,
				canSuperApprove && superApprove,
			)
		: disapprove(
				server,
				reaction.message.id,
				reaction.user.id,
				canSuperApprove && superApprove,
			);

	if (reaction.message.editable) {
		await reaction.message
			.edit({
				embeds: [createApprovalEmbed(approval)],
			})
			.catch(() => {
				reaction.deleteReply().catch(() => {});
				if (!reaction.channel?.isSendable()) return;
				reaction.channel.send({
					embeds: [createApprovalEmbed(approval)],
				});
			});
	}

	const countStr = createApprovalResultString(approval, approving);

	const followUp = await reaction.followUp({
		content: `${approving ? "Approved" : "Disapproved"} by ${userMention(reaction.user.id)} ${canSuperApprove && superApprove ? `(forced, ${countStr}) ` : `(${countStr})`}`,
	});
	setTimeout(() => followUp.delete().catch(() => {}), DELETE_AFTER_MS);

	if (status === ApprovalStatus.Pending) return;

	// Finalization
	await reaction.message.edit({ components: [] });
	await removeApproval(approval);

	switch (status) {
		case ApprovalStatus.Approved:
			return await approval.options.onSuccess(approval, reaction.message);
		case ApprovalStatus.Disapproved: {
			await approval.options.onFailure?.(approval, reaction.message);
			return await reaction
				.followUp({
					content: `The poll \`${approval.content}\` has been disapproved.`,
				})
				.catch(() => {});
		}
		case ApprovalStatus.Timeout: {
			await approval.options.onTimeout?.(approval, reaction.message);
			return await reaction.message
				.edit({
					content: `The poll \`${approval.content}\` has timed out.`,
					components: [],
				})
				.catch(() => {});
		}
	}
	await reaction.message.edit({
		content: "Unknown error occurred while editing approval message",
		embeds: [],
		components: [],
	});
}
