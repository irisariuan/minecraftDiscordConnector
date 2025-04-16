import { EventEmitter } from "node:stream";

interface CacheOptions<T> {
	ttl: number;
	interval: number;
	updateMethod?: () => T | null | Promise<T | null>;
}

class CacheEventEmitter<T> extends EventEmitter {
	on(event: "update", listener: () => void): this
	on(event: "setData", listener: (data: T | null, oldData: T | null) => void): this
	on(event: string, listener: ((data: T | null, oldData: T | null) => void) | (() => void)): this {
		return super.on(event, listener);
	}
	emit(event: "update"): boolean
	emit(event: "setData", data: T | null, oldData: T | null): boolean
	emit(event: string, data?: T | null, oldData?: T | null): boolean {
		return super.emit(event, data, oldData);
	}
}

export class CacheItem<T> {
	private data: T | null;
	private updateMethod?: () => T | null | Promise<T | null>;
	private ttl: number;
	private liveTime: number;
	readonly cacheEvent: CacheEventEmitter<T>;

	constructor(initData: T | null, options?: Partial<CacheOptions<T>>) {
		this.data = initData;
		this.liveTime = Date.now();
		this.ttl = options?.ttl || -1;
		this.updateMethod = options?.updateMethod;
		this.cacheEvent = new CacheEventEmitter<T>();
		if (!initData && this.updateMethod) {
			this.update();
		}

		if (options?.interval && options.interval > 0) {
			setInterval(() => {
				if (this.checkExpired()) {
					this.update();
				}
			}, options.interval);
		}
	}

	async update() {
		if (this.updateMethod) {
			this.cacheEvent.emit("update")
			const newData = await this.updateMethod();
			this.setData(newData);
			return true;
		}
		return false;
	}

	checkExpired(): boolean {
		if (this.ttl <= 0) return false;
		if (!this.data) return true;
		if (this.liveTime + this.ttl < Date.now()) {
			this.resetData();
			return true;
		}
		return false;
	}

	async getData(forceUpdate = false): Promise<T | null> {
		if (forceUpdate || this.checkExpired()) {
			await this.update();
		}
		return this.data;
	}

	setUpdateMethod(updateMethod: () => T | Promise<T>) {
		this.updateMethod = updateMethod;
	}

	setData(data: T | null) {
		this.cacheEvent.emit("setData", data, this.data);
		this.data = data;
		this.liveTime = Date.now();
	}
	resetData() {
		this.data = null;
	}
}
