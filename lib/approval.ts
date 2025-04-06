import { EmbedBuilder, type Message, time, userMention, type PartialMessage, type CommandInteraction } from "discord.js";

export interface BaseApproval {
    content: string,
    validTill: number,
    approvalCount: string[],
    disapprovalCount: string[],
}

export interface Approval extends BaseApproval {
    superStatus: 'approved' | 'disapproved' | null,
    options: ApprovalOptions,
    messageId: string,
    timeout: NodeJS.Timeout,
}

export interface ApprovalOptions {
    description: string,
    onSuccess: (approval: Approval, message: Message | PartialMessage) => Promise<void>,
    onFailure?: (approval: Approval, message: Message | PartialMessage) => Promise<void>,
    onTimeout?: (approval: Approval, message: Message | PartialMessage) => Promise<void>,
}

export const approvalList: Map<string, Approval> = new Map()
export const disapprovalCount = Number(process.env.DISAPPROVAL_COUNT) || 1
export const approvalCount = Number(process.env.APPROVAL_COUNT) || 1

export function newApproval(approval: Omit<Approval, 'approvalCount' | 'disapprovalCount' | 'timeout' | 'superStatus'>, cleanUp: () => void | Promise<void>) {
    const newApproval = {
        ...approval,
        approvalCount: [],
        disapprovalCount: [],
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
    approval.approvalCount.push(userId);
    if (force) {
        approval.superStatus = 'approved';
    }
    return checkApprovalStatus(approval);
}
export function disapprove(messageId: string, userId: string, force = false) {
    const approval = approvalList.get(messageId);
    if (!approval) return;
    approval.disapprovalCount.push(userId);
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
    const status = approval.validTill < Date.now() ? 'timeout' : approval.superStatus === null ? approval.approvalCount.length >= approvalCount ? 'approved' : approval.disapprovalCount.length >= disapprovalCount ? 'disapproved' : 'pending' : approval.superStatus;
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

export function createEmbed(approval: BaseApproval & { options: Pick<ApprovalOptions, 'description'> }, color: number, title: string) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(approval.options.description)
        .addFields(
            { name: 'Approval Count', value: `${approval.approvalCount.length}/${approvalCount} (${approval.approvalCount.map(v => userMention(v)).join(', ')})` },
            { name: 'Disapproval Count', value: `${approval.disapprovalCount.length}/${disapprovalCount} (${approval.disapprovalCount.map(v => userMention(v)).join(', ')})` },
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

export async function sendApprovalPoll(interaction: CommandInteraction, approvalOptions: Pick<Approval, 'content' | 'options'>) {
    const { content, options } = approvalOptions
    const validTill = Date.now() + (Number(process.env.APPROVAL_TIMEOUT) || 1000 * 60 * 60 * 2) // 2 hours
    const embed = createEmbed({
        content,
        validTill,
        approvalCount: [],
        disapprovalCount: [],
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