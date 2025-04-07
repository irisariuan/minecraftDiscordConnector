export type PickAndOptional<T, K extends keyof T, O extends keyof T = never> = Pick<T, K> & Partial<Pick<T, O>>
export function newTimeoutSignal(time: number) {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
        controller.abort()
    }, time)
    return { signal: controller.signal, abort: controller.abort, cancel: () => clearTimeout(timeout) }
}

interface LoggerWritableStreamOptions {
    formatter: (chunk: string) => string
    write?: (chunk: string) => void
    close?: () => void
    abort?: (err: Error) => void
}

export function createLoggerWritableStream(options: LoggerWritableStreamOptions) {
    return new WritableStream<Uint8Array<ArrayBufferLike>>({
        write(chunk) {
            const decoder = new TextDecoder()
            const text = decoder.decode(chunk)
            console.log(options.formatter(text))
            options.write?.(text)
        },
        close() {
            console.log(options.formatter('Stream closed'))
            options.close?.()
        },
        abort(err) {
            console.error(options.formatter('Stream aborted'), err)
            options.abort?.(err)
        }
    })
}

export function safeFetch(url: string, options?: RequestInit) {
    return fetch(url, options).catch(err => {
        // console.error(`Fetch error (${url}): ${err}`)
        return null
    })
}