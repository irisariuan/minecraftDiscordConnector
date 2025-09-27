import type { CreditSettings } from "./lib/settings";

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
	refreshDnsFee: 3,

	newRunCommandPollFee: 20,
	newCancelStopServerPollFee: 30,
	newStartServerPollFee: 30,
	newStopServerPollFee: 30,

	runCommandVoteFee: 20,
	startServerVoteFee: 15,
	cancelStopServerVoteFee: 15,
	stopServerVoteFee: 15,
	uploadFileFee: 70
}