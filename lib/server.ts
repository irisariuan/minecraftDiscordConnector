import { spawn, type Subprocess } from "bun"
import { CacheItem } from "./cache"
import { isServerAlive } from "./request"
import { join } from "node:path"
import { createLoggerWritableStream, safeFetch } from "./utils"

if (!process.env.SERVER_DIR || !(await Bun.file(join(process.env.SERVER_DIR, 'start.sh')).exists())) throw new Error('SERVER_DIR environment variable is not set')

export const serverOnline = new CacheItem<boolean>(false, {
    interval: 1000 * 5,
    ttl: 1000 * 5,
    updateMethod: isServerAlive
})
export let shuttingDown = false
let childProcess: Subprocess<'ignore', 'pipe', 'inherit'> | null = null

function killProcessTimeout(tick: number, shutdownTime = 3000) {
    return Promise.race([new Promise<void>(r => setTimeout(async () => {
        if (childProcess?.exitCode === null) {
            console.log('Forcing to shutdown')
            childProcess?.kill('SIGKILL')
            await childProcess?.exited
        }
        shuttingDown = false;
        r()
    }, tick / 20 * 1000 + shutdownTime)), childProcess?.exited]);
}

export async function haveScheduledShutdown() {
    if (shuttingDown) return true;
    const response = await safeFetch('http://localhost:6001/shuttingDown').catch()
    if (!response) return false
    const { result } = await response.json() as { result: boolean }
    return result
}

export async function initShutdown(tick: number) {
    await serverOnline.update()
    if (!serverOnline || shuttingDown) return null
    shuttingDown = true
    const response = await safeFetch('http://localhost:6001/shutdown', {
        body: JSON.stringify({ tick }),
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    return { ok: response ? response.ok : false, promise: killProcessTimeout(tick) }
}

export async function startServer() {
    await serverOnline.update()
    if (await serverOnline.getData()) return null
    childProcess = spawn(['sh', './start.sh'], {
        cwd: process.env.SERVER_DIR,
        detached: true,
        stdin: 'ignore',
        stdout: 'pipe',
        onExit(subprocess, exitCode, signalCode, error) {
            console.log(`Server process exited with code ${exitCode} and signal ${signalCode}`)
            if (error) {
                console.error(`Error: ${error}`)
            }
            resetShutdownStatus()
        },
    })

    childProcess.stdout.pipeTo(createLoggerWritableStream({ formatter: chunk => `[SERVER] ${chunk}` }))
    serverOnline.setData(true)

    return childProcess.pid
}

export async function completeShutdown() {
    if (shuttingDown) {
        console.log('Shutdown already in progress')
        return
    }
    const data = await initShutdown(0)
    if (!data) return
    const { ok, promise } = data
    console.log(`Shutdown ${ok ? 'successful' : 'failed'}`)
    await promise
    resetShutdownStatus()
    console.log('Shutdown complete')
}

/**
 * @description Reset the shutdown status and server online status, use as a cleanup method
 */
export function resetShutdownStatus() {
    childProcess = null
    serverOnline.setData(false)
    shuttingDown = false
}

process.on('SIGINT', async () => {
    await completeShutdown()
    process.exit(64)
})

process.on('beforeExit', async code => {
    if (code === 64) return
    await completeShutdown()
    process.exit(code)
})

process.on('exit', async code => {
    console.log(`Process exited with code ${code}`)
    process.exit(code)
})