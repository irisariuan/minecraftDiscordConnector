import { isTrueValue } from "./utils";
import { EventEmitter } from "node:events";

class SuspendingEventEmitter extends EventEmitter {
	on(event: "update", listener: (data: boolean) => unknown): this {
		return super.on(event, listener);
	}
	emit(event: "update", data: boolean): boolean {
		return super.emit(event, data);
	}
}

let suspending = isTrueValue(process.env.DEFAULT_SUSPENDING || "") || false;

export function isSuspending(): boolean {
	return suspending;
}
export function setSuspending(value: boolean) {
	if (value === suspending) return;
	suspendingEvent.emit("update", value);
	suspending = value;
}
export const suspendingEvent = new SuspendingEventEmitter();