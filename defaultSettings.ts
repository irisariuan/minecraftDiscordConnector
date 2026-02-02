import type { ApprovalSettings, CreditSettings } from "./lib/settings";

export const defaultCreditSettings: CreditSettings = {
	dailyGift: 20,
	giftMax: 70,

	trasnferringPercentageFee: 0.05,
	baseTransferringFee: 3,
	transferringDifferencePenaltyPercentage: 0.1,
	transferringDifferencePenaltyThreshold: 50,
	maxTransferringFee: 150,

	checkUserCreditFee: 3,
	checkUserPermissionFee: 3,
	checkUserTicketFee: 3,
	refreshDnsFee: 3,

	newRunCommandPollFee: 20,
	newCancelStopServerPollFee: 30,
	newStartServerPollFee: 30,
	newStopServerPollFee: 30,

	runCommandVoteFee: 20,
	startServerVoteFee: 15,
	cancelStopServerVoteFee: 15,
	stopServerVoteFee: 15,
	uploadFileFee: 70,
	deletePluginFee: 70,
	
	editFileFee: 120,
};
export const defaultApprovalSettings: ApprovalSettings = {
	cancelStopServerApproval: 2,
	cancelStopServerDisapproval: 2,

	runCommandApproval: 4,
	runCommandDisapproval: 2,

	startServerApproval: 3,
	startServerDisapproval: 3,

	stopServerApproval: 2,
	stopServerDisapproval: 2,
};
