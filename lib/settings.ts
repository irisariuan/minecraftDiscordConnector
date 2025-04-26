export interface ChangableSettings {
	transferringFee: number;
	checkUserCreditFee: number;
	checkUserPermissionFee: number;
	refreshDnsFee: number;

	newCancelStopServerPollFee: number;
	newRunCommandPollFee: number;
	newStartServerPollFee: number;
	newStopServerPollFee: number;

	runCommandVoteFee: number;
	startServerVoteFee: number;
	cancelStopServerVoteFee: number;
	stopServerVoteFee: number;
}
export const settings: ChangableSettings = {
	transferringFee: 5,
	checkUserCreditFee: 5,
	checkUserPermissionFee: 5,
	refreshDnsFee: 20,

	newRunCommandPollFee: 20,
	newCancelStopServerPollFee: 10,
	newStartServerPollFee: 5,
	newStopServerPollFee: 30,

	runCommandVoteFee: 10,
	startServerVoteFee: 15,
	cancelStopServerVoteFee: 20,
	stopServerVoteFee: 5,
};
export function changeSettings(changes: Partial<ChangableSettings>) {
	for (const [key, val] of Object.entries(changes)) {
		if (key in settings) {
			settings[key as keyof ChangableSettings] = val
		}
	}
}