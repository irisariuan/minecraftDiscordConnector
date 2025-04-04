interface CacheOptions<T> {
    ttl: number,
    interval: number,
    updateMethod?: () => T | Promise<T>
}

export class CacheItem<T> {
    private data: T | null
    private updateMethod?: () => T | Promise<T>
    private ttl: number
    private liveTime: number
    constructor(initData: T | null, options?: Partial<CacheOptions<T>>) {
        this.data = initData
        this.liveTime = Date.now()
        this.ttl = options?.ttl || -1;
        this.updateMethod = options?.updateMethod;
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
            this.liveTime = Date.now();
            this.data = await this.updateMethod();
            return true
        }
        return false
    }

    checkExpired(): boolean {
        if (this.ttl <= 0) return false;
        if (!this.data) return true;
        if (this.liveTime + this.ttl < Date.now()) {
            this.data = null;
            return true;
        }
        return false;
    }

    getData(): T | null {
        if (this.checkExpired()) {
            this.update();
        }
        return this.data;
    }
}