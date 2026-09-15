/**
 * Resolving a Minecraft player to the Discord account behind them.
 *
 * A player can be known by two UUIDs at once. The proxy authenticates against
 * Mojang and reports that one; a backend behind `forwarding: none` runs offline
 * and knows the same player by the UUID it derives from their name, so a `/link`
 * run in game there records *that* one. Anything that has to recognise a player
 * therefore has to try both, and everything that records a link has to write
 * both.
 *
 * The offline UUID is only trustworthy because it is derived from the name
 * Mojang confirmed: claiming somebody else's offline identity would mean owning
 * their Minecraft account first.
 */
import { data } from "../../api";

const PLUGIN_ID = "minecraft";

/** The identities one player may be recorded under, in order of authority. */
export function identitiesOf(player: { uuid: string; offlineUuid?: string }) {
	const ids = [player.uuid];
	if (player.offlineUuid && player.offlineUuid !== player.uuid) {
		ids.push(player.offlineUuid);
	}
	return ids.filter(Boolean);
}

/** Look up the Discord account linked to one Minecraft UUID, or null. */
async function identityOf(uuid: string) {
	if (!uuid) return null;
	try {
		return await data.request("identity:getByExternal", {
			pluginId: PLUGIN_ID,
			externalId: uuid,
		});
	} catch {
		return null;
	}
}

/** Look up a player by either identity they may be recorded under. */
export async function linkedAccount(player: {
	uuid: string;
	offlineUuid?: string;
}) {
	for (const externalId of identitiesOf(player)) {
		const link = await identityOf(externalId);
		if (link) return link;
	}
	return null;
}
