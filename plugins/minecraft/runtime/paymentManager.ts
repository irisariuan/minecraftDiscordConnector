/**
 * Per-player pay-to-play tracking for a Minecraft server. Moved out of the core
 * `Server` class — this is Minecraft-specific (keyed by player UUID) and used
 * only by the connector callback routes.
 */
interface Payment {
	startTime: number;
	validDuration: number;
	timeout: NodeJS.Timeout;
}

export class PaymentManager {
	private payment = new Map<string, Payment>();
	private timeouts = new Set<NodeJS.Timeout>();

	markPaid(uuid: string, paymentInterval: number) {
		this.markUnpaid(uuid);
		const timeout = setTimeout(() => {
			this.payment.delete(uuid);
			this.timeouts.delete(timeout);
		}, paymentInterval);
		this.payment.set(uuid, {
			startTime: Date.now(),
			validDuration: paymentInterval,
			timeout,
		});
		this.timeouts.add(timeout);
	}

	markUnpaid(uuid: string) {
		const payment = this.payment.get(uuid);
		if (payment) {
			clearTimeout(payment.timeout);
			this.payment.delete(uuid);
			this.timeouts.delete(payment.timeout);
		}
	}

	hasPaid(uuid: string) {
		return this.payment.has(uuid);
	}

	reset() {
		for (const timeout of this.timeouts) clearTimeout(timeout);
		this.timeouts.clear();
		this.payment.clear();
	}
}

/** One PaymentManager per server id. */
const managers = new Map<number, PaymentManager>();

export function paymentManagerFor(serverId: number): PaymentManager {
	let manager = managers.get(serverId);
	if (!manager) {
		manager = new PaymentManager();
		managers.set(serverId, manager);
	}
	return manager;
}
