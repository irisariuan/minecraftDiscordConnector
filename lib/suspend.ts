let suspending = false
export function isSuspending(): boolean {
    return suspending
}
export function setSuspending(value: boolean) {
    suspending = value
}