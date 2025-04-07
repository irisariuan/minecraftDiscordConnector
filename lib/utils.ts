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
    return new WritableStream({
        write(chunk) {
            console.log(options.formatter(chunk.toString()))
            options.write?.(chunk.toString())
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