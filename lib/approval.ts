import { EmbedBuilder, time } from "discord.js";

export interface Approval {
    command: string,
    messageId: string,
    validTill: number,
    approvalCount: number,
    disapprovalCount: number,
}
export const approvalList: Map<string, Approval> = new Map()
export const disapprovalCount = Number(process.env.DISAPPROVAL_COUNT) || 1
export const approvalCount = Number(process.env.APPROVAL_COUNT) || 1

export function newApproval(approval: Omit<Approval, 'approvalCount' | 'disapprovalCount'>) {
    approvalList.set(approval.messageId, {
        ...approval,
        approvalCount: 0,
        disapprovalCount: 0,
    });
}

export function approve(messageId: string) {
    const approval = approvalList.get(messageId);
    if (!approval) return;
    approval.approvalCount++;
    return checkApprovalStatus(approval);
}
export function disapprove(messageId: string) {
    const approval = approvalList.get(messageId);
    if (!approval) return;
    approval.disapprovalCount++;
    return checkApprovalStatus(approval);
}

function removeApproval(messageId: string) {
    approvalList.delete(messageId);
}

type ApprovalStatus = 'approved' | 'disapproved' | 'pending' | 'timeout';

function checkApprovalStatus(approval: Approval): ApprovalStatus {
    if (approval.validTill < Date.now()) {
        removeApproval(approval.messageId);
        return 'timeout';
    }
    const status = approval.approvalCount >= approvalCount ? 'approved' : approval.disapprovalCount >= disapprovalCount ? 'disapproved' : 'pending';
    if (status !== 'pending') {
        removeApproval(approval.messageId);
    }
    return status;
}

export function getApproval(messageId: string): Approval | null {
    const approval = approvalList.get(messageId);
    if (!approval) return null;
    if (approval.validTill < Date.now()) {
        removeApproval(messageId);
        return null;
    }
    return approval;
}

export function createApprovalEmbed(approval: Approval) {
    switch (checkApprovalStatus(approval)) {
        case 'pending': {
            return new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Pending')
                .setDescription(`Command: ${approval.command}`)
                .addFields(
                    { name: 'Approval Count', value: `${approval.approvalCount}/${approvalCount}` },
                    { name: 'Disapproval Count', value: `${approval.disapprovalCount}/${disapprovalCount}` },
                    { name: 'Valid Till', value: time(new Date(approval.validTill)) },
                )
                .setTimestamp(Date.now())
                .setFooter({ text: 'Approval System' });
        }
        case 'approved': {
            return new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('Approved')
                .setDescription(`Command: ${approval.command}`)
                .addFields(
                    { name: 'Approval Count', value: `${approval.approvalCount}/${approvalCount}` },
                    { name: 'Disapproval Count', value: `${approval.disapprovalCount}/${disapprovalCount}` },
                    { name: 'Valid Till', value: time(new Date(approval.validTill)) },
                )
                .setTimestamp(Date.now())
                .setFooter({ text: 'Approval System' });
        }
        case 'disapproved': {
            return new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Disapproved')
                .setDescription(`Command: ${approval.command}`)
                .addFields(
                    { name: 'Approval Count', value: `${approval.approvalCount}/${approvalCount}` },
                    { name: 'Disapproval Count', value: `${approval.disapprovalCount}/${disapprovalCount}` },
                    { name: 'Valid Till', value: time(new Date(approval.validTill)) },
                )
                .setTimestamp(Date.now())
                .setFooter({ text: 'Approval System' });
        }
        case 'timeout': {
            return new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Timeout')
                .setDescription(`Command: ${approval.command}`)
                .addFields(
                    { name: 'Approval Count', value: `${approval.approvalCount}/${approvalCount}` },
                    { name: 'Disapproval Count', value: `${approval.disapprovalCount}/${disapprovalCount}` },
                    { name: 'Valid Till', value: time(new Date(approval.validTill)) },
                )
                .setTimestamp(Date.now())
                .setFooter({ text: 'Approval System' });
        }
    }
}