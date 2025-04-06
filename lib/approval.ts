import { EmbedBuilder, time } from "discord.js";

export interface Approval {
    command: string,
    messageId: string,
    validTill: number,
    approvalCount: string[],
    disapprovalCount: string[],
    timeout: NodeJS.Timeout,
}
export const approvalList: Map<string, Approval> = new Map()
export const disapprovalCount = Number(process.env.DISAPPROVAL_COUNT) || 1
export const approvalCount = Number(process.env.APPROVAL_COUNT) || 1

export function newApproval(approval: Omit<Approval, 'approvalCount' | 'disapprovalCount' | 'timeout'>, cleanUp: () => void | Promise<void>) {
    const newApproval = {
        ...approval,
        approvalCount: [],
        disapprovalCount: [],
        timeout: setTimeout(() => {
            removeApproval(approval.messageId);
            cleanUp();
        }, approval.validTill - Date.now()),
    }
    approvalList.set(approval.messageId, newApproval);
    return newApproval;
}

export function approve(messageId: string, userId: string) {
    const approval = approvalList.get(messageId);
    if (!approval) return;
    approval.approvalCount.push(userId);
    return checkApprovalStatus(approval);
}
export function disapprove(messageId: string, userId: string) {
    const approval = approvalList.get(messageId);
    if (!approval) return;
    approval.disapprovalCount.push(userId);
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
    const status = approval.validTill < Date.now() ? 'timeout' : approval.approvalCount.length >= approvalCount ? 'approved' : approval.disapprovalCount.length >= disapprovalCount ? 'disapproved' : 'pending';
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

export function createEmbed(approval: Omit<Approval, 'messageId' | 'timeout'>, color: number, title: string) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(`Command: ${approval.command}`)
        .addFields(
            { name: 'Approval Count', value: `${approval.approvalCount.length}/${approvalCount} (${approval.approvalCount.join(', ')})` },
            { name: 'Disapproval Count', value: `${approval.disapprovalCount.length}/${disapprovalCount} (${approval.disapprovalCount.join(', ')})` },
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
            return createEmbed(approval, 0x00FF00, 'Approved')
        }
        case 'disapproved': {
            return createEmbed(approval, 0xFF0000, 'Disapproved');
        }
        case 'timeout': {
            return createEmbed(approval, 0xFF0000, 'Timeout');
        }
    }
}