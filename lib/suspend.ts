let suspending = true
export function isSuspending(): boolean {
    return suspending
}
export function setSuspending(value: boolean) {
    suspending = value
}