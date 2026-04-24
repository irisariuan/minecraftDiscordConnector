import { defaultSettings } from "../defaultSettings";
import { getServerSettings, SettingType, upsertSetting } from "./db";
import type { Server, ServerManager } from "./server";

const SETTINGS = `${process.cwd()}/data/settings.json`;

export interface ServerSettings {
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
	cancelShutdownFee: number;

	paymentInterval: number;

	cancelStopServerApproval: number;
	cancelStopServerDisapproval: number;

	runCommandApproval: number;
	runCommandDisapproval: number;

	startServerApproval: number;
	startServerDisapproval: number;

	stopServerApproval: number;
	stopServerDisapproval: number;
}

export interface GlobalSettings extends ServerSettings {
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

const approvalKeys = new Set<string>([
	"cancelStopServerApproval",
	"cancelStopServerDisapproval",
	"runCommandApproval",
	"runCommandDisapproval",
	"startServerApproval",
	"startServerDisapproval",
	"stopServerApproval",
	"stopServerDisapproval",
]);

export let settings: GlobalSettings = defaultSettings;

export function setSettings(
	changes: Partial<GlobalSettings>,
	serverManager: ServerManager,
) {
	settings = { ...settings, ...changes };
	for (const server of serverManager.getAllServers()) {
		for (const [k, v] of Object.entries(changes)) {
			if (
				!Object.keys(server.settings).includes(k) ||
				defaultSettings[k as keyof GlobalSettings] !== v
			)
				continue;
			server.settings[k as keyof ServerSettings] = v;
		}
	}
}

async function saveSettings(changes: Partial<GlobalSettings>) {
	const currentLocalSettings = await loadSettings();
	const newSettings = { ...currentLocalSettings, ...changes };
	return await Bun.write(SETTINGS, JSON.stringify(newSettings, null, 4));
}

export async function changeSettings(
	changes: Partial<GlobalSettings>,
	serverManager: ServerManager,
) {
	setSettings(changes, serverManager);
	await saveSettings(changes);
}

export async function loadSettings(): Promise<Partial<GlobalSettings>> {
	const file = Bun.file(SETTINGS);
	if (!(await file.exists())) return {};
	const data = await file.json().catch(() => ({}));
	return data;
}

export async function loadServerSettings(
	id: number,
): Promise<Partial<ServerSettings>> {
	const settings: Partial<ServerSettings> = {};
	for (const entry of await getServerSettings(id)) {
		settings[entry.name as keyof ServerSettings] = entry.value;
	}
	return settings;
}

export async function editSetting(
	server: Server,
	changes: Partial<ServerSettings>,
) {
	for (const [key, value] of Object.entries(changes)) {
		const type = approvalKeys.has(key)
			? SettingType.Approval
			: SettingType.ServerCredit;
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
	server.settings = {
		...server.settings,
		...changes,
	};
}
