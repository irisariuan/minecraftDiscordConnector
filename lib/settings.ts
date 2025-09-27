import { defaultCreditSettings } from "../defaultSettings";

const SETTINGS = `${process.cwd()}/data/settings.json`;

export interface CreditSettings {
	dailyGift: number;
	giftMax: number;

	baseTransferringFee: number;
	trasnferringPercentageFee: number;
	/**
	 * Use a **float** for percentage, e.g. 0.1 for 10%
	 */
	transferringDifferencePenaltyPercentage: number;
	transferringDifferencePenaltyThreshold: number;
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

	uploadFileFee: number;
	deletePluginFee: number;
}
export let settings: CreditSettings = defaultCreditSettings;

export function setCreditSettings(changes: Partial<CreditSettings>) {
	settings = { ...settings, ...changes };
}

async function saveCreditSettings(settings: Partial<CreditSettings>) {
	const currentLocalSettings = await loadCreditSettings();
	const newSettings = { ...currentLocalSettings, ...settings };
	return await Bun.write(SETTINGS, JSON.stringify(newSettings, null, 4));
}

export async function changeCreditSettings(changes: Partial<CreditSettings>) {
	setCreditSettings(changes);
	await saveCreditSettings(changes);
}

export async function loadCreditSettings(): Promise<Partial<CreditSettings>> {
	const settings = Bun.file(SETTINGS);
	if (!(await settings.exists())) return {};
	const data = await settings.json().catch(() => ({}));
	return data;
}
