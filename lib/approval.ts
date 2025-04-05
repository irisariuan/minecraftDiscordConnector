export interface Approval {
    command: string,
    messageId: string,
    validTill: number
}
export const approvalList: Map<string, Approval> = new Map()

export function addApproval(approval: Approval) {
    approvalList.set(approval.messageId, approval);
}

export function removeApproval(messageId: string) {
    approvalList.delete(messageId);
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