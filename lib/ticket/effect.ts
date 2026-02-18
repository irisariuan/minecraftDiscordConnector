import { TicketEffectType, type TicketEffect } from "../ticket";
import type { DetailTimeout } from "../utils";

interface EffectTimeout extends DetailTimeout {
	effect: TicketEffect;
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
	private usageMap: Map<string, EffectTimeout> = new Map();
	private userUsageMap: Map<string, string[]> = new Map(); // <userId, ticketIds>
	constructor() {}

	private addToUserUsage(userId: string, ticketId: string) {
		const tickets = this.userUsageMap.get(userId) ?? [];
		tickets.push(ticketId);
		if (!this.userUsageMap.has(userId)) {
			this.userUsageMap.set(userId, tickets);
		}
	}
	private removeFromUserUsage(userId: string, ticketId: string) {
		const tickets = this.userUsageMap.get(userId);
		if (!tickets) return;
		const index = tickets.indexOf(ticketId);
		if (index !== -1) {
			tickets.splice(index, 1);
		}
		if (tickets.length === 0) {
			this.userUsageMap.delete(userId);
		}
	}
	getUserActiveEffects(userId: string) {
		const ticketIds = this.userUsageMap.get(userId) ?? [];
		return ticketIds
			.map((ticketId) => ({
				ticket: this.usageMap.get(ticketId),
				ticketId,
			}))
			.filter(
				(entry): entry is { ticket: EffectTimeout; ticketId: string } =>
					entry.ticket !== undefined,
			);
	}

	use(
		userId: string,
		ticketId: string,
		effect: TicketEffect,
		onExpire?: () => unknown,
	): boolean {
		if (this.inUse(ticketId)) return false;
		const duration = calculateEffectDuration(effect);
		if (duration === null) return false;
		const timeout = setTimeout(() => {
			this.usageMap.delete(ticketId);
			this.removeFromUserUsage(userId, ticketId);
			onExpire?.();
		}, duration);

		this.usageMap.set(ticketId, {
			timeout,
			expireTime: new Date(Date.now() + duration),
			startTime: new Date(),
			effect,
		});
		this.addToUserUsage(userId, ticketId);
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
