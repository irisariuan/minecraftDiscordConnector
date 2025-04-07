import { spawn, type Subprocess } from "bun"
import { CacheItem } from "./cache"
import { isServerAlive } from "./request"
import { createLoggerWritableStream } from "./utils"

if (!process.env.SERVER_DIR) throw new Error('SERVER_DIR environment variable is not set')

export const serverOnline = new CacheItem<boolean>(false, {
    interval: 1000 * 5,
    ttl: 1000 * 5,
    updateMethod: isServerAlive
})
export let shuttingDown = false
let childProcess: Subprocess<'ignore', 'pipe', 'inherit'> | null = null

export async function shutdown(tick: number) {
    if (!serverOnline || shuttingDown) return false
    shuttingDown = true
    const response = await fetch('https://localhost:6001/shutdown', {
        body: JSON.stringify({ tick }),
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    setTimeout(() => {
        shuttingDown = false;

    }, 1000 * 30 + tick / 20 * 1000);
    return response.ok
}

export async function startServer() {
    if (await serverOnline.getData()) return null
    childProcess = spawn(['./start.sh'], {
        cwd: process.env.SERVER_DIR,
        detached: true,
        stdin: 'ignore',
        stdout: 'pipe',
        onExit(subprocess, exitCode, signalCode, error) {
            console.log(`Server process exited with code ${exitCode} and signal ${signalCode}`)
            if (error) {
                console.error(`Error: ${error}`)
            }
            serverOnline.setData(false)
            childProcess = null
        },
    })
    
    childProcess.stdout.pipeTo(createLoggerWritableStream({ formatter: chunk => `[SERVER] ${chunk}` }))
    serverOnline.setData(true)

    return childProcess.pid
}