const SETTINGS = `${process.cwd()}/data/settings.json`;

export interface CreditSettings {
	dailyGift: number;
	giftMax: number;

	baseTransferringFee: number;
	trasnferringPercentageFee: number;
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
	dailyGift: 5,
	giftMax: 100,

	trasnferringPercentageFee: 0.05,
	baseTransferringFee: 5,
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
