import { EventEmitter } from "node:stream"

interface CacheOptions<T> {
    ttl: number,
    interval: number,
    updateMethod?: () => T | Promise<T>,
}

class CacheEventEmitter<T> extends EventEmitter {
    on(event: 'update', listener: (data: T) => void) {
        return super.on(event, listener)
    }
    emit(event: 'update', data: T) {
        return super.emit(event, data)
    }
}

export class CacheItem<T> {
    private data: T | null
    private updateMethod?: () => T | Promise<T>
    private ttl: number
    private liveTime: number
    readonly cacheEvent: CacheEventEmitter<T>

    constructor(initData: T | null, options?: Partial<CacheOptions<T>>) {
        this.data = initData
        this.liveTime = Date.now()
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
            const newData = await this.updateMethod()
            if (newData !== this.data) {
                this.cacheEvent.emit('update', newData);
            }
            this.setData(newData)
            return true
        }
        return false
    }

    checkExpired(): boolean {
        if (this.ttl <= 0) return false;
        if (!this.data) return true;
        if (this.liveTime + this.ttl < Date.now()) {
            this.resetData()
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

    setData(data: T) {
        this.data = data;
        this.liveTime = Date.now();
    }
    resetData() {
        this.data = null;
    }
}