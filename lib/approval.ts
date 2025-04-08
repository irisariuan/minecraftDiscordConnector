import { EmbedBuilder, type Message, time, userMention, type PartialMessage, type CommandInteraction } from "discord.js";
import type { PickAndOptional } from "./utils";

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
}

export interface ApprovalOptions {
    description: string,
    approvalCount?: number,
    disapprovalCount?: number,
    onSuccess: (approval: Approval, message: Message | PartialMessage) => Promise<unknown>,
    onFailure?: (approval: Approval, message: Message | PartialMessage) => Promise<unknown>,
    onTimeout?: (approval: Approval, message: Message | PartialMessage) => Promise<unknown>,
}

export const approvalList: Map<string, Approval> = new Map()
export const globalDisapprovalCount = Number(process.env.DISAPPROVAL_COUNT) || 1
export const globalApprovalCount = Number(process.env.APPROVAL_COUNT) || 1

export function newApproval(approval: Omit<Approval, 'approvalIds' | 'disapprovalIds' | 'timeout' | 'superStatus'>, cleanUp: () => unknown | Promise<unknown>) {
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
    approvalList.set(approval.messageId, newApproval);
    return newApproval;
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
    clearTimeout(approval.timeout);
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
    if (autoRemoval && checkApprovalStatus(approval) !== 'pending') {
        removeApproval(messageId);
        return null;
    }
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
    })
    console.log(`Polling for command ${interaction.commandName} with message id ${message.resource?.message?.id}`)
    await message.resource.message.react('✅')
    await message.resource.message.react('❌')
    await message.resource.message.react('📤')
    await message.resource.message.react('🏁')
    await message.resource.message.react('🏳️')
}