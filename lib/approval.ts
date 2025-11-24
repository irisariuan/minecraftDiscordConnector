import {
	ButtonInteraction,
	EmbedBuilder,
	MessageFlags,
	time,
	userMention,
	type CommandInteraction,
	type Message,
	type PartialMessage,
} from "discord.js";
import {
	ApprovalMessageComponentId,
	createApprovalMessageComponent,
	parseApprovalComponentId,
} from "./approval/component";
import { changeCredit, sendCreditNotification, spendCredit } from "./credit";
import {
	compareAnyPermissions,
	comparePermission,
	PermissionFlags,
	readPermission,
} from "./permission";
import type { PickAndOptional } from "./utils";
import type { Server, ServerManager } from "./server";

/**
 * All core components needed for the approval system to work
 */
export interface CoreApproval {
	content: string;
	validTill: number;
	duration: number;
	approvalIds: string[];
	disapprovalIds: string[];
	server: Server;
}

export interface Approval extends CoreApproval {
	superStatus: "approved" | "disapproved" | null;
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
	approvalCount?: number;
	disapprovalCount?: number;
	requireSuperApproval?: boolean;
	callerId: string;
	startPollFee?: number;
	credit?: number;
	onSuccess: (
		approval: Approval,
		message: Message | PartialMessage,
	) => Promise<unknown>;
	onFailure?: (
		approval: Approval,
		message: Message | PartialMessage,
	) => Promise<unknown>;
	onTimeout?: (
		approval: Approval,
		message: Message | PartialMessage,
	) => Promise<unknown>;
}

export const MESSAGE_VALID_TIME = 14 * 60 * 1000; // 14 minutes, since discord message valid time is 15 minutes
export const DELETE_AFTER_MS = 3 * 1000;

export const globalDisapprovalCount =
	Number(process.env.DISAPPROVAL_COUNT) || 1;
export const globalApprovalCount = Number(process.env.APPROVAL_COUNT) || 1;

export function newApproval(
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
			() => timeoutCleanUpFunc,
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

export function transferApproval(
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

export function approve(
	server: Server,
	messageId: string,
	userId: string,
	force = false,
) {
	const approval = getApproval(server, messageId);
	if (!approval) return;
	approval.approvalIds.push(userId);
	if (force) {
		approval.superStatus = "approved";
	}
	return checkApprovalStatus(approval);
}
export function disapprove(
	server: Server,
	messageId: string,
	userId: string,
	force = false,
) {
	const approval = getApproval(server, messageId);
	if (!approval) return;
	approval.disapprovalIds.push(userId);
	if (force) {
		approval.superStatus = "disapproved";
	}
	return checkApprovalStatus(approval);
}

export async function removeApproval(approval: Approval) {
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

type ApprovalStatus = "approved" | "disapproved" | "pending" | "timeout";

function checkApprovalStatus(approval: Approval): ApprovalStatus {
	const approvalCount = approval.options.approvalCount || globalApprovalCount;
	const disapprovalCount =
		approval.options.disapprovalCount || globalDisapprovalCount;
	const requireSuperApproval = approval.options.requireSuperApproval ?? false;
	if (approval.validTill > Date.now()) {
		if (approval.superStatus) return approval.superStatus;
		if (
			approval.approvalIds.length >= approvalCount &&
			!requireSuperApproval
		)
			return "approved";
		if (approval.disapprovalIds.length >= disapprovalCount)
			return "disapproved";

		return "pending";
	}
	return "timeout";
}

export function getApproval(
	server: Server,
	messageId: string,
	forceReturn = false,
): Approval | null {
	const approval = server.approvalList.get(messageId);
	if (approval) {
		if (checkApprovalStatus(approval) !== "pending" && !forceReturn)
			return null;
		return approval;
	}
	for (const [key, approval] of server.approvalList.entries()) {
		if (
			key === messageId ||
			approval.message.id === messageId ||
			approval.originalMessageId === messageId
		) {
			if (checkApprovalStatus(approval) !== "pending" && !forceReturn)
				return null;
			return approval;
		}
	}
	return null;
}

function createUserMentions(ids: string[]) {
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
	const approvalCount = approval.options.approvalCount || globalApprovalCount;
	const disapprovalCount =
		approval.options.disapprovalCount || globalDisapprovalCount;
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

export async function sendApprovalPoll(
	interaction: CommandInteraction,
	approvalOptions: PickAndOptional<
		Approval,
		"content" | "options" | "server",
		"duration"
	>,
) {
	const { content, options } = approvalOptions;
	const duration =
		approvalOptions.duration ||
		Number(process.env.APPROVAL_TIMEOUT) ||
		1000 * 60 * 60 * 2;
	const validTill = Date.now() + duration; // 2 hours
	const embed = createInternalApprovalEmbed(
		{
			content,
			duration,
			validTill,
			approvalIds: [],
			disapprovalIds: [],
			options,
			server: approvalOptions.server,
		},
		0x0099ff,
		"Pending",
	);
	const message = await interaction.followUp({
		embeds: [embed],
		components: [createApprovalMessageComponent()],
		withResponse: true,
	});
	newApproval(
		{
			createdAt: Date.now(),
			content,
			validTill,
			duration,
			options,
			message,
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
			const newMessage = await approval.message.channel.send({
				embeds: [createApprovalEmbed(approval)],
				components: [createApprovalMessageComponent()],
			});
			transferApproval(approval, newMessage);
		},
	);
	console.log(
		`Polling for command ${interaction.commandName} with message id ${message.id}`,
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
	const userPerm = await readPermission(reaction.user);
	let approving: boolean;
	let disapproving: boolean;
	let canceling: boolean;
	let superApprove: boolean;
	const canSuperApprove = comparePermission(
		userPerm,
		PermissionFlags.superApprove,
	);
	const canRepeatApprove = comparePermission(
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
		});
		const res = await answer
			.awaitMessageComponent({
				time: 10 * 1000,
				filter: (i) => i.user.id === reaction.user.id,
			})
			.catch(() => null);
		await answer.delete();
		if (!res || res.customId === ApprovalMessageComponentId.Revoke) {
			return await reaction.followUp({
				content: "Timeout or cancelled, no action taken",
				flags: [MessageFlags.Ephemeral],
			});
		}
		const final = parseApprovalComponentId(
			res.customId as ApprovalMessageComponentId,
		);
		approving = final.approveVote;
		superApprove = final.superVote;
		disapproving = final.rejectVote;
		canceling = final.revokeVote;
	} else {
		approving = approveVote;
		disapproving = rejectVote;
		canceling = revokeVote;
		superApprove = false;
	}
	if (
		server.suspendingEvent.isSuspending() &&
		!comparePermission(userPerm, PermissionFlags.suspend)
	) {
		return await reaction.followUp({
			content:
				"The server is currently suspended, you do not have permission to approve or disapprove",
			flags: [MessageFlags.Ephemeral],
		});
	}
	if (canceling) {
		const prevCount =
			approval.approvalIds.length + approval.disapprovalIds.length;
		approval.approvalIds = approval.approvalIds.filter(
			(id) => id !== reaction.user.id,
		);
		approval.disapprovalIds = approval.disapprovalIds.filter(
			(id) => id !== reaction.user.id,
		);
		if (
			prevCount ===
			approval.approvalIds.length + approval.disapprovalIds.length
		) {
			return await reaction.followUp({
				content: "You have not approved or disapproved this poll",
				flags: [MessageFlags.Ephemeral],
			});
		}
		if (reaction.message.editable) {
			await reaction.message
				.edit({
					embeds: [createApprovalEmbed(approval)],
				})
				.catch(console.error);
		}
		if (approval.options.credit) {
			const voted =
				prevCount -
				approval.approvalIds.length -
				approval.disapprovalIds.length;
			await changeCredit({
				userId: reaction.user.id,
				change: approval.options.credit * voted,
				reason: "Approval Reaction Refund",
			});
			await sendCreditNotification({
				user: reaction.user,
				creditChanged: approval.options.credit * voted,
				reason: "Approval Reaction Refund",
				silent: true,
				serverId: approval.server.id,
			});
		}
		return await reaction.followUp({
			content: `Cancelled by ${userMention(reaction.user.id)}`,
			flags: [MessageFlags.Ephemeral],
		});
	}
	if (
		!canRepeatApprove &&
		approving &&
		approval.approvalIds.includes(reaction.user.id) &&
		!(superApprove && canSuperApprove)
	) {
		return await reaction.followUp({
			content: "You have already approved this poll",
			flags: [MessageFlags.Ephemeral],
		});
	}
	if (
		!canRepeatApprove &&
		disapproving &&
		approval.disapprovalIds.includes(reaction.user.id) &&
		!(superApprove && canSuperApprove)
	) {
		return await reaction.followUp({
			content: "You have already disapproved this poll",
			flags: [MessageFlags.Ephemeral],
		});
	}

	// Check if the user is already in the opposite list and remove them
	if (
		!canRepeatApprove &&
		disapproving &&
		approval.approvalIds.includes(reaction.user.id) &&
		!(superApprove && canSuperApprove)
	) {
		approval.approvalIds = approval.approvalIds.filter(
			(id) => id !== reaction.user.id,
		);
	} else if (
		!canRepeatApprove &&
		approving &&
		approval.disapprovalIds.includes(reaction.user.id) &&
		!(superApprove && canSuperApprove)
	) {
		approval.disapprovalIds = approval.disapprovalIds.filter(
			(id) => id !== reaction.user.id,
		);
		// Check if need to spend credit for new reaction
	} else if (approval.options.credit) {
		const success = await spendCredit({
			userId: reaction.user.id,
			cost: approval.options.credit,
			reason: "Approval Reaction",
			serverId: approval.server.id,
		});
		if (!success) {
			return await reaction.followUp({
				content: `You do not have enough credit to approve this poll`,
				flags: [MessageFlags.Ephemeral],
			});
		}
		await sendCreditNotification({
			user: reaction.user,
			creditChanged: -approval.options.credit,
			reason: "Approval Reaction",
			serverId: approval.server.id,
		});
	}

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
			.catch(console.error);
	}

	const countStr = approving
		? `${approval.approvalIds.length}/${approval.options.approvalCount || globalApprovalCount}`
		: `${approval.disapprovalIds.length}/${approval.options.disapprovalCount || globalDisapprovalCount}`;

	await reaction
		.followUp({
			content: `${approving ? "Approved" : "Disapproved"} by ${userMention(reaction.user.id)} ${canSuperApprove && superApprove ? `(forced, ${countStr}) ` : `(${countStr})`}`,
		})
		.then((message) =>
			setTimeout(
				() => message.delete().catch(console.error),
				DELETE_AFTER_MS,
			),
		)
		.catch(console.error);

	if (status === "pending") return;

	await reaction.message.edit({ components: [] });
	await removeApproval(approval);

	if (status === "approved") {
		return await approval.options.onSuccess(approval, reaction.message);
	}
	if (status === "disapproved") {
		await approval.options.onFailure?.(approval, reaction.message);
		return await reaction
			.followUp({
				content: `The poll \`${approval.content}\` has been disapproved.`,
			})
			.catch(console.error);
	}
	if (status === "timeout") {
		await approval.options.onTimeout?.(approval, reaction.message);
		return await reaction.message
			.edit({
				content: `The poll \`${approval.content}\` has timed out.`,
				components: [],
			})
			.catch(console.error);
	}
	await reaction.message.edit({
		content: "Unknown error occurred",
		embeds: [],
		components: [],
	});
}
