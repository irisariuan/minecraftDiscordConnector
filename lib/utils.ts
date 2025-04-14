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

export function safeFetch(url: string | URL, options?: RequestInit, logError = true, timeout: null | number = null, cache = false) {
    if (timeout) {
        const { signal, cancel } = newTimeoutSignal(timeout)
        const opts = {
            ...options,
            signal,
            cache: cache ? 'force-cache' : 'default',
        }
        return fetch(url, opts).finally(() => cancel()).catch(err => {
            if (logError) console.error(`Fetch error (${url}): ${err}`)
            return null
        })
    }
    return fetch(url, options).catch(err => {
        if (logError) console.error(`Fetch error (${url}): ${err}`)
        return null
    })
}

export function endsWith(str: string, suffix: string) {
    if (str.endsWith(suffix)) return str
    return str + suffix
}

export function notEndsWith(str: string, suffix: string) {
    if (str.endsWith(suffix)) return str.slice(0, -suffix.length)
    return str
}