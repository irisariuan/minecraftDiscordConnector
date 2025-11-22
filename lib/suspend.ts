import { EventEmitter } from "node:events";

export class SuspendingEventEmitter extends EventEmitter {
	private suspending: boolean;
	constructor(suspending: boolean) {
		super();
		this.suspending = suspending;
	}
	isSuspending(): boolean {
		return this.suspending;
	}
	setSuspending(value: boolean) {
		if (this.suspending === value) return;
		this.suspending = value;
		this.emit("update", value);
	}

	on(event: "update", listener: (data: boolean) => unknown): this {
		return super.on(event, listener);
	}
	emit(event: "update", data: boolean): boolean {
		return super.emit(event, data);
	}
}
