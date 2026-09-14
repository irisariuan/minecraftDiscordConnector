/**
 * The Minecraft side of linking.
 *
 * The one-time code components are shared with the rest of the bot — the same
 * exchange now runs from the waiting room as well as from Discord — so they are
 * re-exported from the plugin API rather than kept here twice.
 */
export {
	createOtpButtonRow,
	createOtpInputModal,
	OTPAction,
} from "../../api";

/**
 * Lookup Minecraft player profile by UUID or Player name using Minecraft Services API
 * @param identifier UUID or Player name
 */
export async function lookupPlayerByIdentifier(identifier: string) {
	const res = await fetch(
		"https://api.minecraftservices.com/minecraft/profile/lookup/" +
			identifier,
	);
	if (!res.ok) return null;
	const data = await res.json().catch(() => null);
	if (!data || !data.id || !data.name) return null;
	return data as { id: string; name: string };
}
