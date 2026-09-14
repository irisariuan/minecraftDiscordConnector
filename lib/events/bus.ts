import { EventEmitter } from "node:events";

/** Shape of a single request/response channel definition. */
export interface RequestShape {
	params: unknown;
	result: unknown;
}

/**
 * Typed event bus with two communication styles:
 *
 * - **Broadcast events** (`emit` / `on` / `once` / `off`) — fire-and-forget
 *   notifications, many listeners.
 * - **Request/response channels** (`handle` / `request`) — data access with a
 *   single handler per channel and a typed result.
 *
 * The generic maps make every event name, payload, request parameter and
 * request result fully type-checked at the call site.
 */
export class EventBus<
	EventMap extends Record<string, unknown>,
	RequestMap extends Record<string, RequestShape>,
> {
	private readonly _emitter = new EventEmitter();
	private readonly _handlers = new Map<
		keyof RequestMap,
		(params: never) => unknown
	>();

	// ── Broadcast events ─────────────────────────────────────────────────────

	emit<K extends keyof EventMap & string>(
		event: K,
		payload: EventMap[K],
	): void {
		this._emitter.emit(event, payload);
	}

	on<K extends keyof EventMap & string>(
		event: K,
		listener: (payload: EventMap[K]) => void,
	): this {
		this._emitter.on(event, listener);
		return this;
	}

	once<K extends keyof EventMap & string>(
		event: K,
		listener: (payload: EventMap[K]) => void,
	): this {
		this._emitter.once(event, listener);
		return this;
	}

	off<K extends keyof EventMap & string>(
		event: K,
		listener: (payload: EventMap[K]) => void,
	): this {
		this._emitter.off(event, listener);
		return this;
	}

	// ── Request/response channels ────────────────────────────────────────────

	/**
	 * Register the single handler backing a request channel.
	 * Throws when the channel already has a handler.
	 */
	handle<K extends keyof RequestMap & string>(
		channel: K,
		handler: (
			params: RequestMap[K]["params"],
		) => RequestMap[K]["result"] | Promise<RequestMap[K]["result"]>,
	): void {
		if (this._handlers.has(channel))
			throw new Error(
				`A handler is already registered for channel "${channel}"`,
			);
		this._handlers.set(channel, handler);
	}

	unhandle<K extends keyof RequestMap & string>(channel: K): void {
		this._handlers.delete(channel);
	}

	/**
	 * Send a request to a channel and await its typed result.
	 * Channels whose `params` type is `undefined` take no argument.
	 */
	async request<K extends keyof RequestMap & string>(
		channel: K,
		...args: RequestMap[K]["params"] extends undefined
			? []
			: [RequestMap[K]["params"]]
	): Promise<RequestMap[K]["result"]> {
		const handler = this._handlers.get(channel);
		if (!handler)
			throw new Error(
				`No handler registered for channel "${channel}" — the core has not exposed this data channel`,
			);
		return (await handler(args[0] as never)) as RequestMap[K]["result"];
	}
}
