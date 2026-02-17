import { TicketEffectType, type TicketEffect } from "../ticket";

interface TicketEffectUsage {
	timeout: NodeJS.Timeout;
	expireTime: Date;
	startTime: Date;
}

export class TicketEffectManager {
	// This class is used to manage persistent ticket effects

	/**
	 * Map of active ticket effects. The key is the ticket ID, and the value is an object containing the timeout and expiration time.
	 *
	 * K, V
	 *
	 * <ticketId, timeout>
	 */
	private usageMap: Map<string, TicketEffectUsage> = new Map();
	constructor() {}
	use(
		ticketId: string,
		effect: TicketEffect,
		onExpire?: () => unknown,
	): boolean {
		if (this.inUse(ticketId)) return false;
		const duration = calculateEffectDuration(effect);
		if (duration === null) return false;
		const timeout = setTimeout(() => {
			this.usageMap.delete(ticketId);
			onExpire?.();
		}, duration);

		this.usageMap.set(ticketId, {
			timeout,
			expireTime: new Date(Date.now() + duration),
			startTime: new Date(),
		});
		return true;
	}
	inUse(ticketId: string) {
		return this.usageMap.has(ticketId);
	}
	stop(ticketId: string) {
		const time = this.usageMap.get(ticketId);
		if (time) {
			clearTimeout(time.timeout);
			this.usageMap.delete(ticketId);
		}
	}
	get(ticketId: string) {
		return this.usageMap.get(ticketId);
	}
}

export function calculateEffectDuration(effect: TicketEffect) {
	switch (effect.effect) {
		case TicketEffectType.FreePlay: {
			// Value is in hours, convert to milliseconds
			return effect.value * 60 * 60 * 1000;
		}
		default: {
			return null;
		}
	}
}

export const ticketEffectManager = new TicketEffectManager();
