import { EmbedBuilder, type Message, time, userMention, type PartialMessage, type CommandInteraction, type MessageReaction, type PartialMessageReaction, type User, type PartialUser, MessageFlags, type Channel } from "discord.js";
import type { PickAndOptional } from "./utils";
import { readPermission, comparePermission, PermissionFlags, compareAnyPermissions } from "./permission";
import { isSuspending } from "./suspend";

export interface BaseApproval {
    content: string,
    validTill: number,
    duration: number,
    approvalIds: string[],
    disapprovalIds: string[],
}

export interface Approval extends BaseApproval {
    superStatus: 'approved' | 'disapproved' | null,
    options: ApprovalOptions,
    messageId: string,
    timeout: NodeJS.Timeout,
    updateInterval?: NodeJS.Timeout,
}

export interface ApprovalOptions {
    description: string,
    approvalCount?: number,
    disapprovalCount?: number,
    onSuccess: (approval: Approval, message: Message | PartialMessage) => Promise<unknown>,
    onFailure?: (approval: Approval, message: Message | PartialMessage) => Promise<unknown>,
    onTimeout?: (approval: Approval, message: Message | PartialMessage) => Promise<unknown>,
}

export const MESSAGE_VALID_TIME = 14 * 60 * 1000 // 14 minutes, since discord message valid time is 15 minutes
export const DELETE_AFTER_MS = 3 * 1000

export const approvalList: Map<string, Approval> = new Map()
export const globalDisapprovalCount = Number(process.env.DISAPPROVAL_COUNT) || 1
export const globalApprovalCount = Number(process.env.APPROVAL_COUNT) || 1

export function newApproval(approval: Omit<Approval, 'approvalIds' | 'disapprovalIds' | 'timeout' | 'superStatus'>, cleanUp: () => unknown | Promise<unknown>, update: () => unknown | Promise<unknown>) {
    removeApproval(approval.messageId)
    const newApproval: Approval = {
        ...approval,
        approvalIds: [],
        disapprovalIds: [],
        timeout: setTimeout(() => {
            cleanUp();
            removeApproval(approval.messageId);
        }, approval.validTill - Date.now()),
        superStatus: null,
    }
    if (approval.duration > MESSAGE_VALID_TIME) {
        approval.updateInterval = setInterval(() => {
            update();
            if (approval.validTill < Date.now()) {
                clearTimeout(newApproval.timeout);
                removeApproval(approval.messageId);
            }
        }, MESSAGE_VALID_TIME);
    }
    approvalList.set(approval.messageId, newApproval);
    return newApproval;
}

export function transferApproval(oldMessageId: string, newMessageId: string) {
    const approval = approvalList.get(oldMessageId);
    if (!approval) return;
    approvalList.delete(oldMessageId);
    approval.messageId = newMessageId;
    approvalList.set(newMessageId, approval);
}

export function approve(messageId: string, userId: string, force = false) {
    const approval = approvalList.get(messageId);
    if (!approval) return;
    approval.approvalIds.push(userId);
    if (force) {
        approval.superStatus = 'approved';
    }
    return checkApprovalStatus(approval);
}
export function disapprove(messageId: string, userId: string, force = false) {
    const approval = approvalList.get(messageId);
    if (!approval) return;
    approval.disapprovalIds.push(userId);
    if (force) {
        approval.superStatus = 'disapproved';
    }
    return checkApprovalStatus(approval);
}

export function removeApproval(messageId: string) {
    const approval = approvalList.get(messageId);
    if (!approval) return;
    console.log(`Removing approval ${messageId}`)
    clearTimeout(approval.timeout);
    clearInterval(approval.updateInterval);
    approvalList.delete(messageId);
}

type ApprovalStatus = 'approved' | 'disapproved' | 'pending' | 'timeout';

function checkApprovalStatus(approval: Approval, autoRemoval = true): ApprovalStatus {
    const approvalCount = approval.options.approvalCount || globalApprovalCount;
    const disapprovalCount = approval.options.disapprovalCount || globalDisapprovalCount;
    const status =
        approval.validTill < Date.now() ? 'timeout' :
            approval.superStatus === null ? approval.approvalIds.length >= approvalCount ? 'approved' :
                approval.disapprovalIds.length >= disapprovalCount ? 'disapproved' : 'pending' : approval.superStatus;

    if (autoRemoval && status !== 'pending') {
        removeApproval(approval.messageId);
    }
    return status;
}

export function getApproval(messageId: string, autoRemoval = true): Approval | null {
    const approval = approvalList.get(messageId);
    if (!approval) return null;
    if (checkApprovalStatus(approval) !== 'pending') return null
    return approval;
}

export function createEmbed(approval: BaseApproval & { options: Pick<ApprovalOptions, 'description' | 'approvalCount' | 'disapprovalCount'> }, color: number, title: string) {
    const approvalCount = approval.options.approvalCount || globalApprovalCount;
    const disapprovalCount = approval.options.disapprovalCount || globalDisapprovalCount;
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(approval.options.description)
        .addFields(
            { name: 'Approval Count', value: `${approval.approvalIds.length}/${approvalCount} (${approval.approvalIds.map(v => userMention(v)).join(', ')})` },
            { name: 'Disapproval Count', value: `${approval.disapprovalIds.length}/${disapprovalCount} (${approval.disapprovalIds.map(v => userMention(v)).join(', ')})` },
            { name: 'Valid Till', value: time(new Date(approval.validTill)) },
        )
        .setTimestamp(Date.now())
        .setFooter({ text: 'Approval System' });
}

export function createApprovalEmbed(approval: Approval) {
    switch (checkApprovalStatus(approval)) {
        case 'pending': {
            return createEmbed(approval, 0x0099FF, 'Pending')
        }
        case 'approved': {
            return createEmbed(approval, 0x00FF00, approval.superStatus === 'approved' ? 'Approved (Force)' : 'Approved')
        }
        case 'disapproved': {
            return createEmbed(approval, 0xFF0000, approval.superStatus === 'disapproved' ? 'Disapproved (Force)' : 'Disapproved');
        }
        case 'timeout': {
            return createEmbed(approval, 0xFF0000, 'Timeout');
        }
    }
}

export async function sendApprovalPoll(interaction: CommandInteraction, approvalOptions: PickAndOptional<Approval, 'content' | 'options', 'duration'>) {
    const { content, options } = approvalOptions
    const duration = approvalOptions.duration || Number(process.env.APPROVAL_TIMEOUT) || 1000 * 60 * 60 * 2
    const validTill = Date.now() + duration // 2 hours
    const embed = createEmbed({
        content,
        duration,
        validTill,
        approvalIds: [],
        disapprovalIds: [],
        options
    }, 0x0099FF, 'Pending')
    const message = await interaction.reply({ embeds: [embed], withResponse: true })
    if (!message.resource?.message?.id) {
        return interaction.editReply({ content: "Unknown error occurred" })
    }
    newApproval({
        content,
        messageId: message.resource?.message?.id,
        validTill,
        duration,
        options
    }, async () => {
        if (!message.resource?.message?.id) return
        const approval = getApproval(message.resource?.message?.id, false)
        if (!approval) return
        await interaction.editReply({ embeds: [createApprovalEmbed(approval)] })
        removeApproval(message.resource?.message?.id)
    }, async () => {
        if (!message.resource?.message?.channel.isSendable()) return
        const approval = getApproval(message.resource?.message?.id, false)
        if (!approval) return
        if (message.resource.message.deletable) {
            message.resource.message.delete().catch(console.error)
        }
        const newMessage = await message.resource.message.channel.send({ embeds: [createApprovalEmbed(approval)] })
        transferApproval(message.resource?.message?.id, newMessage.id)
        console.log(`Transferring approval message from ${message.resource?.message?.id} to ${newMessage.id}`)
        await newMessage.react('✅')
        await newMessage.react('❌')
        await newMessage.react('📤')
        await newMessage.react('🏁')
        await newMessage.react('🏳️')
    })
    console.log(`Polling for command ${interaction.commandName} with message id ${message.resource?.message?.id}`)
    await message.resource.message.react('✅')
    await message.resource.message.react('❌')
    await message.resource.message.react('📤')
    await message.resource.message.react('🏁')
    await message.resource.message.react('🏳️')
}

export async function updateApprovalMessage(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
    const approval = getApproval(reaction.message.id)
    if (!approval) return
    const userPerm = await readPermission(user.id)
    const approving = reaction.emoji.name === '✅' || reaction.emoji.name === '🏁'
    const disapproving = reaction.emoji.name === '❌' || reaction.emoji.name === '🏳️'
    const canceling = reaction.emoji.name === '📤'
    const superApprove = reaction.emoji.name === '🏁' || reaction.emoji.name === '🏳️'
    const isValidReaction = ['✅', '❌', '🏁', '🏳️', '📤'].includes(reaction.emoji.name || '')
    const canSuperApprove = comparePermission(userPerm, PermissionFlags.superApprove)

    const userReactions = reaction.message.reactions.cache.filter(r => r.users.cache.has(user.id))
    for (const userReaction of userReactions.values()) {
        await userReaction.users.remove(user.id).catch(console.error);
    }
    if (!isValidReaction || !compareAnyPermissions(userPerm, [PermissionFlags.approve, PermissionFlags.superApprove])) return
    if (isSuspending() && !comparePermission(userPerm, PermissionFlags.suspend)) {
        return await reaction.message.reply({
            content: 'The server is currently suspended, you do not have permission to approve or disapprove',
            flags: [MessageFlags.SuppressNotifications]
        })
            .then(message => setTimeout(() => message.delete().catch(console.error), DELETE_AFTER_MS))
            .catch(console.error)
    }
    if (canceling) {
        const prevCount = approval.approvalIds.length + approval.disapprovalIds.length
        approval.approvalIds = approval.approvalIds.filter(id => id !== user.id)
        approval.disapprovalIds = approval.disapprovalIds.filter(id => id !== user.id)
        if (prevCount === approval.approvalIds.length + approval.disapprovalIds.length) {
            return reaction.message.reply({ content: 'You have not approved or disapproved this poll', flags: [MessageFlags.SuppressNotifications] })
                .then(message => setTimeout(() => message.delete().catch(console.error), DELETE_AFTER_MS))
                .catch(console.error)
        }
        if (reaction.message.editable) {
            await reaction.message.edit({
                embeds: [createApprovalEmbed(approval)]
            }).catch(console.error)
        }
        return await reaction.message.reply({
            content: `Cancelled by ${userMention(user.id)}`,
            flags: [MessageFlags.SuppressNotifications]
        })
            .then(message => setTimeout(() => message.delete().catch(console.error), DELETE_AFTER_MS))
            .catch(console.error)
    }
    if (approving && approval.approvalIds.includes(user.id) && !(superApprove && canSuperApprove)) {
        return await reaction.message.reply({ content: 'You have already approved this poll', flags: [MessageFlags.SuppressNotifications] })
            .then(message => setTimeout(() => message.delete().catch(console.error), DELETE_AFTER_MS))
            .catch(console.error)
    }
    if (disapproving && approval.disapprovalIds.includes(user.id) && !(superApprove && canSuperApprove)) {
        return await reaction.message.reply({ content: 'You have already disapproved this poll', flags: [MessageFlags.SuppressNotifications] })
            .then(message => setTimeout(() => message.delete().catch(console.error), DELETE_AFTER_MS))
            .catch(console.error)
    }

    // Check if the user is already in the opposite list and remove them
    if (disapproving && approval.approvalIds.includes(user.id) && !(superApprove && canSuperApprove)) {
        approval.approvalIds = approval.approvalIds.filter(id => id !== user.id)
    } else if (approving && approval.disapprovalIds.includes(user.id) && !(superApprove && canSuperApprove)) {
        approval.disapprovalIds = approval.disapprovalIds.filter(id => id !== user.id);
    }

    const status = approving ? approve(reaction.message.id, user.id, canSuperApprove && superApprove) : disapprove(reaction.message.id, user.id, canSuperApprove && superApprove)

    if (reaction.message.editable) {
        await reaction.message.edit({
            embeds: [createApprovalEmbed(approval)]
        }).catch(console.error)
    }

    const countStr = approving ? `${approval.approvalIds.length}/${approval.options.approvalCount || globalApprovalCount}` : `${approval.disapprovalIds.length}/${approval.options.disapprovalCount || globalDisapprovalCount}`

    await reaction.message.reply({
        content: `${approving ? 'Approved' : 'Disapproved'} by ${userMention(user.id)} ${canSuperApprove && superApprove ? `(forced, ${countStr}) ` : `(${countStr})`}`,
    }).catch(console.error)

    if (status !== 'pending') {
        await reaction.message.reactions.removeAll()
    } else {
        return
    }

    if (status === 'approved') {
        return await approval.options.onSuccess(approval, reaction.message)
    }
    if (status === 'disapproved') {
        await approval.options.onFailure?.(approval, reaction.message)
        return await reaction.message.reply({
            content: `The poll \`${approval.content}\` has been disapproved.`,
        }).catch(console.error)
    }
    await approval.options.onTimeout?.(approval, reaction.message)
    await reaction.message.reply({
        content: `The poll \`${approval.content}\` has timed out.`,
    }).catch(console.error)
}