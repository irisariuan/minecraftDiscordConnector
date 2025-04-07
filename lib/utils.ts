export type PickAndOptional<T, K extends keyof T, O extends keyof T = never> = Pick<T, K> & Partial<Pick<T, O>>
export function newTimeoutSignal(time: number) {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
        controller.abort()
    }, time)
    return { signal: controller.signal, abort: controller.abort, cancel: () => clearTimeout(timeout) }
}

export function createDisposableWritableStream(onData: (chunk: string) => void, onClose?: () => void, onAbort?: (err: Error) => void) {
    return new WritableStream<Uint8Array<ArrayBufferLike>>({
        write(chunk) {
            const decoder = new TextDecoder()
            const text = decoder.decode(chunk)
            onData(text)
        },
        close() {
            onClose?.()
        },
        abort(err) {
            onAbort?.(err)
        }
    })
}

export function safeFetch(url: string, options?: RequestInit) {
    return fetch(url, options).catch(err => {
        // console.error(`Fetch error (${url}): ${err}`)
        return null
    })
}