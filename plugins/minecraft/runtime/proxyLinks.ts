import { getRandomOtp } from "../../api";

/** How long an in-game-initiated link code stays valid, in seconds. */
export const linkTtlSeconds = 300;

/** How often expired codes are swept out of memory, in milliseconds. */
const SWEEP_INTERVAL_MS = 60 * 1000;

/** A pending in-game link waiting for its `/linkcode` on Discord. */
export interface PendingLink {
	/** Six-digit, single-use code shown to the player in game. */
	code: string;
	/** Lowercase dashed Minecraft UUID of the player who asked to link. */
	uuid: string;
	/** Player name at the time the code was issued. */
	playername: string;
	/** Epoch milliseconds after which the code is no longer accepted. */
	expiresAt: number;
}

/** code → pending link. */
const byCode = new Map<string, PendingLink>();
/** uuid → code, so a re-issued code replaces the player's previous one. */
const byUuid = new Map<string, string>();

/** Drop every entry whose TTL has elapsed. */
function sweep(now = Date.now()) {
	for (const [code, link] of byCode.entries()) {
		if (link.expiresAt > now) continue;
		byCode.delete(code);
		if (byUuid.get(link.uuid) === code) byUuid.delete(link.uuid);
	}
}

const sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
// Never hold the process open just to sweep an empty map.
sweepTimer.unref?.();

/** Remove a player's outstanding code, if they have one. */
function forget(uuid: string) {
	const existing = byUuid.get(uuid);
	if (existing !== undefined) byCode.delete(existing);
	byUuid.delete(uuid);
}

/**
 * Issue a fresh six-digit link code for a Minecraft account, replacing any code
 * that account already holds. The code lives in memory only and expires after
 * {@link linkTtlSeconds}.
 */
export function beginLink(uuid: string, playername: string): PendingLink {
	const now = Date.now();
	sweep(now);
	forget(uuid);

	let code = getRandomOtp();
	// Collisions are unlikely but must never hand two players the same code.
	for (let attempt = 0; byCode.has(code) && attempt < 20; attempt++) {
		code = getRandomOtp();
	}
	if (byCode.has(code)) {
		throw new Error("Could not allocate a free link code, try again later");
	}

	const link: PendingLink = {
		code,
		uuid,
		playername,
		expiresAt: now + linkTtlSeconds * 1000,
	};
	byCode.set(code, link);
	byUuid.set(uuid, code);
	return link;
}

/**
 * Redeem a code. Returns the pending link and removes it (codes are single use),
 * or null when the code is unknown or has expired.
 */
export function consumeLink(code: string): PendingLink | null {
	const now = Date.now();
	sweep(now);
	const link = byCode.get(code);
	if (!link) return null;
	if (link.expiresAt <= now) {
		forget(link.uuid);
		return null;
	}
	forget(link.uuid);
	return link;
}

/** Whether a Minecraft account currently holds an unexpired code. */
export function hasPendingLink(uuid: string): boolean {
	sweep();
	return byUuid.has(uuid);
}
