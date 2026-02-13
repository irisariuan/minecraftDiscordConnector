import {
	defaultApprovalSettings,
	defaultCreditSettings,
} from "../defaultSettings";
import {
	getServerApprovalSettings,
	getServerCreditSettings,
	SettingType,
	upsertSetting,
} from "./db";
import type { Server } from "./server";

const SETTINGS = `${process.cwd()}/data/settings.json`;
const APPROVAL_SETTINGS = `${process.cwd()}/data/approvalSettings.json`;

export interface ServerCreditSettings {
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

	editFileFee: number;
	lsFilesFee: number;
	deleteFileFee: number;
	viewFileFee: number;
	playFee: number;
}

export interface CreditSettings extends ServerCreditSettings {
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
	checkUserTicketFee: number;
	refreshDnsFee: number;
}
export interface ApprovalSettings {
	cancelStopServerApproval: number;
	cancelStopServerDisapproval: number;

	runCommandApproval: number;
	runCommandDisapproval: number;

	startServerApproval: number;
	startServerDisapproval: number;

	stopServerApproval: number;
	stopServerDisapproval: number;
}

export let settings: CreditSettings = defaultCreditSettings;
export let approvalSettings: ApprovalSettings = defaultApprovalSettings;

export function setApprovalSettings(changes: Partial<ApprovalSettings>) {
	approvalSettings = { ...approvalSettings, ...changes };
}

function saveApprovalSettings(settings: Partial<ApprovalSettings>) {
	const currentLocalSettings = approvalSettings;
	const newSettings = { ...currentLocalSettings, ...settings };
	return Bun.write(APPROVAL_SETTINGS, JSON.stringify(newSettings, null, 4));
}
export async function changeApprovalSettings(
	changes: Partial<ApprovalSettings>,
) {
	setApprovalSettings(changes);
	return await saveApprovalSettings(changes);
}

export async function loadApprovalSettings(): Promise<
	Partial<ApprovalSettings>
> {
	const settings = Bun.file(APPROVAL_SETTINGS);
	if (!(await settings.exists())) return {};
	const data = await settings.json().catch(() => ({}));
	return data;
}

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

export async function loadServerCreditSetting(
	id: number,
): Promise<ServerCreditSettings> {
	const serverSettings = await getServerCreditSettings(id);
	if (!serverSettings) {
		return defaultCreditSettings;
	}

	// Filter out null values and only include defined server settings
	const filteredServerSettings: Partial<ServerCreditSettings> = {};
	for (const setting of serverSettings) {
		filteredServerSettings[setting.name as keyof ServerCreditSettings] =
			setting.value;
	}
	return { ...defaultCreditSettings, ...filteredServerSettings };
}

export async function loadServerApprovalSetting(
	id: number,
): Promise<ApprovalSettings> {
	const serverSettings = await getServerApprovalSettings(id);
	if (!serverSettings) {
		return defaultApprovalSettings;
	}
	const filteredServerSettings: Partial<ApprovalSettings> = {};
	for (const setting of serverSettings) {
		filteredServerSettings[setting.name as keyof ApprovalSettings] =
			setting.value;
	}
	return { ...defaultApprovalSettings, ...filteredServerSettings };
}

export async function editSetting(
	server: Server,
	type: SettingType,
	changes: Partial<
		SettingType extends SettingType.ServerCredit
			? ServerCreditSettings
			: ApprovalSettings
	>,
) {
	for (const [key, value] of Object.entries(changes)) {
		await upsertSetting({
			create: {
				name: key,
				value,
				type,
				serverId: server.id,
			},
			update: { value },
			where: {
				serverId_name_type: {
					name: key,
					serverId: server.id,
					type,
				},
			},
		});
	}
}
