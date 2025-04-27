const SETTINGS = `${process.cwd()}/data/settings.json`;

export interface CreditSettings {
	dailyGift: number;
	giftMax: number;

	baseTransferringFee: number;
	trasnferringPercentageFee: number;
	transferringDifferencePenaltyPercentage: number;
	transferringDifferencePenaltyTrigger: number;
	maxTransferringFee: number;
	
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
export const settings: CreditSettings = {
	dailyGift: 20,
	giftMax: 70,

	trasnferringPercentageFee: 0.05,
	baseTransferringFee: 3,
	transferringDifferencePenaltyPercentage: 0.1,
	transferringDifferencePenaltyTrigger: 50,
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
};

export function setSetting(changes: Partial<CreditSettings>) {
	for (const [key, val] of Object.entries(changes)) {
		if (key in settings) {
			settings[key as keyof CreditSettings] = val;
		}
	}
}

async function saveSettings(settings: Partial<CreditSettings>) {
	const currentLocalSettings = await loadSettings();
	const newSettings = { ...currentLocalSettings, ...settings };
	return await Bun.write(SETTINGS, JSON.stringify(newSettings, null, 4));
}

export async function changeCreditSettings(changes: Partial<CreditSettings>) {
	setSetting(changes);
	await saveSettings(changes)
}

export async function loadSettings(): Promise<Partial<CreditSettings>> {
	const settings = Bun.file(SETTINGS);
	if (!(await settings.exists())) return {};
	const data = await settings.json().catch(() => ({}));
	return data;
}
