/**
 * Linking a Discord account from inside the game.
 *
 * The proof is the same one the Discord `/link` uses, run the other way round.
 * There, a player names their Minecraft account on Discord and reads the code in
 * game; here they name their Discord account in game and read the code there,
 * then type it into a direct message. Either way the code has to cross from one
 * account to the other, which is what makes the pair of them a link and not an
 * assertion.
 *
 * It matters that this exists at all: the Discord `/link` needs a server to be
 * running, because the connector plugin is what puts the code on screen. A
 * player who arrives to find everything down could never reach the state in
 * which linking was possible. The waiting room can show them a code with no
 * server running at all.
 */
import { data, getRandomOtp } from "../../api";
import { identitiesOf, linkedAccount } from "./identity";

const PLUGIN_ID = "minecraft";

/** How long a code stays good for, matching the Discord `/link`. */
const LINK_TIMEOUT_MS = 5 * 60 * 1000;

/** Statuses `POST /link` answers with. Mirrored in `CONTROL_API.md`. */
export type LinkStatus =
	| "pending"
	| "already_linked"
	| "unknown_user"
	| "unreachable"
	| "failed";

/** States an accepted attempt passes through, reported on `POST /session`. */
type LinkState = "pending" | "linked" | "failed";

export interface LinkResult {
	status: LinkStatus;
	message: string;
	/** The code to show in game. Set only for `pending`. */
	code?: string;
	/** The Discord account the code went to, as resolved. */
	discord?: string;
}

interface Attempt {
	state: LinkState;
	message: string;
	discord: string;
	code: string;
	/** When a still-pending attempt stops being worth remembering. */
	expiresAt: number;
}

/**
 * Attempts in flight, keyed by the player's Mojang UUID.
 *
 * In memory rather than in the database on purpose: an attempt is worth exactly
 * as long as the direct message it is waiting on, and a restart invalidates
 * that anyway. Nothing here outlives the process, and nothing needs to.
 */
const attempts = new Map<string, Attempt>();

/** Drop attempts nobody is coming back for, so the map cannot grow forever. */
function prune() {
	const now = Date.now();
	for (const [uuid, attempt] of attempts) {
		if (attempt.expiresAt <= now) attempts.delete(uuid);
	}
}

/** How a player's last link attempt is going, for `POST /session`. */
export function linkAttemptOf(uuid: string) {
	prune();
	const attempt = attempts.get(uuid);
	if (!attempt) return null;
	return {
		state: attempt.state,
		message: attempt.message,
		discord: attempt.discord,
	};
}

/**
 * Start linking `player` to the Discord account they named.
 *
 * It returns as soon as there is a code to show them. Whether anybody types it
 * is settled minutes later, by a person reading a direct message, and is
 * reported through {@link linkAttemptOf} instead — holding the request open for
 * five minutes would tie up a proxy connection goroutine for the whole of it
 * and still tell the player nothing sooner.
 *
 * One consequence worth knowing: a direct message that cannot be delivered is
 * also reported that way, so a player briefly holds a code that will never be
 * used. They are told within a refresh, which is seconds.
 */
export async function beginLink(player: {
	uuid: string;
	offlineUuid: string;
	name: string;
	discord: string;
}): Promise<LinkResult> {
	prune();

	if (await linkedAccount(player)) {
		return {
			status: "already_linked",
			message:
				"That Minecraft account is already linked. Use /unlink on Discord first if you want to link it to a different account.",
		};
	}

	// A second attempt while one is live re-shows the same code rather than
	// sending another message. Otherwise typing the command twice, which people
	// do when nothing appears to happen, would message somebody twice.
	const live = attempts.get(player.uuid);
	if (live?.state === "pending") {
		return {
			status: "pending",
			message: "",
			code: live.code,
			discord: live.discord,
		};
	}

	const user = await data
		.request("discord:findUser", { query: player.discord })
		.catch(() => null);
	if (!user) {
		return {
			status: "unknown_user",
			message: `No Discord user called "${player.discord}" shares a server with the bot. Use your Discord username, or your user id.`,
		};
	}

	const code = getRandomOtp();
	attempts.set(player.uuid, {
		state: "pending",
		message: "",
		discord: user.username,
		code,
		expiresAt: Date.now() + LINK_TIMEOUT_MS,
	});

	void settle(player, user, code).catch((err) => {
		console.error("[mcproxy] in-game link failed:", err);
		fail(player.uuid, "Something went wrong while linking. Try again.");
	});

	return { status: "pending", message: "", code, discord: user.username };
}

/** Wait on the direct message, and record the link if it is confirmed. */
async function settle(
	player: { uuid: string; offlineUuid: string; name: string },
	user: { id: string; username: string },
	code: string,
) {
	const result = await data.request("discord:confirmOtp", {
		discordId: user.id,
		otp: code,
		content:
			`**${player.name}** is in the Minecraft waiting room and asked to link this Discord account.\n\n` +
			"If that is you, press the button below and enter the code shown on your screen in game. " +
			"If it is not, ignore this message — nothing happens without the code.",
		timeoutMs: LINK_TIMEOUT_MS,
	});

	if (result.status === "unreachable") {
		fail(
			player.uuid,
			`The bot could not message ${user.username} on Discord. They need to allow direct messages from server members, or you can link with /link on Discord instead.`,
		);
		return;
	}
	if (result.status !== "confirmed") {
		fail(player.uuid, "That code expired before it was entered.");
		return;
	}

	// Both identities are recorded, because a player really can be known by
	// both: a backend behind `forwarding: none` runs offline and names them by
	// the UUID it derives from their name, which is the one anything inside that
	// server reports. Linking only the verified UUID would leave them looking
	// unverified to their own server's connector.
	for (const externalId of identitiesOf(player)) {
		await data.request("identity:link", {
			pluginId: PLUGIN_ID,
			externalId,
			discordId: user.id,
			metadata: { playername: player.name },
		});
	}

	attempts.set(player.uuid, {
		state: "linked",
		message: "",
		discord: user.username,
		code,
		expiresAt: Date.now() + LINK_TIMEOUT_MS,
	});
}

/** Record that an attempt will not complete, and why. */
function fail(uuid: string, message: string) {
	const attempt = attempts.get(uuid);
	if (!attempt) return;
	attempts.set(uuid, {
		...attempt,
		state: "failed",
		message,
		expiresAt: Date.now() + LINK_TIMEOUT_MS,
	});
}
