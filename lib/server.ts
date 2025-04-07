import { spawn, type Subprocess } from "bun"
import { CacheItem } from "./cache"
import { isServerAlive } from "./request"
import { join } from "node:path"
import { createLoggerWritableStream, safeFetch } from "./utils"

if (!process.env.SERVER_DIR || !(await Bun.file(join(process.env.SERVER_DIR, 'start.sh')).exists())) throw new Error('SERVER_DIR environment variable is not set')

interface ServerManagerOptions {
    shutdownAllowedTime?: number,
}

class ServerManager {
    private instance: Subprocess<'ignore', 'pipe', 'inherit'> | null
    private waitingToShutdown: boolean
    isOnline: CacheItem<boolean>
    shutdownAllowedTime: number

    constructor({ shutdownAllowedTime }: ServerManagerOptions) {
        this.instance = null
        this.isOnline = new CacheItem<boolean>(false, {
            interval: 1000 * 5,
            ttl: 1000 * 5,
            updateMethod: isServerAlive
        })
        this.waitingToShutdown = false
        this.shutdownAllowedTime = shutdownAllowedTime ?? 3000
    }

    async captureNextLineOfOutput() {
        if (!this.instance) throw new Error('No server instance')
        const decoder = new TextDecoder()
        const reader = this.instance.stdout.getReader()
        const { done, value } = await reader.read()
        if (done) {
            throw new Error('Stream closed')
        }
        const text = decoder.decode(value)
        return text
    }

    async start() {
        if (this.instance || await this.isOnline.getData(true)) return null
        this.instance = spawn(['sh', './start.sh'], {
            cwd: process.env.SERVER_DIR,
            detached: true,
            stdin: 'ignore',
            stdout: 'pipe',
            onExit: (subprocess, exitCode, signalCode, error) => {
                console.log(`Server process exited with code ${exitCode} and signal ${signalCode}`)
                if (error) {
                    console.error(`Error: ${error}`)
                }
            },
        })
        this.isOnline.setData(true)
        this.instance.stdout.pipeTo(createLoggerWritableStream({ formatter: chunk => `[SERVER] ${chunk}` }))
        this.instance.exited.then(() => {
            this.cleanup()
        })
        return this.instance.pid
    }

    async forceStop() {
        if (this.instance?.exitCode === null) {
            this.instance?.kill('SIGKILL')
            await this.instance?.exited
            return true
        }
        return false
    }

    async stop(tick: number) {
        if (this.waitingToShutdown || !await this.isOnline.getData(true)) return { success: false }
        this.waitingToShutdown = true
        const response = await safeFetch('http://localhost:6001/shutdown', {
            body: JSON.stringify({ tick }),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        if (!response) return { success: false }
        const { success } = await response.json() as { success: boolean }
        if (!success) {
            this.waitingToShutdown = false
            return { success: false }
        }
        const promise = this.raceShutdown(tick / 20 * 1000 + this.shutdownAllowedTime)
        return { promise, success }
    }

    async raceShutdown(ms: number) {
        return Promise.race([
            this.instance?.exited,
            new Promise<void>(r => setTimeout(async () => {
                if (await this.forceStop()) {
                    console.log('Server process forcefully stopped')
                }
                r()
            }, ms))])
    }

    async haveServerSideScheduledShutdown() {
        const response = await safeFetch('http://localhost:6001/shuttingDown').catch()
        if (!response) return false
        const { result } = await response.json() as { result: boolean }
        return result
    }

    async cancelServerSideShutdown() {
        if (!await this.haveServerSideScheduledShutdown()) return false
        const response = await safeFetch('http://localhost:6001/cancelShutdown', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        if (!response) return false
        const { success } = await response.json() as { success: boolean }
        return success
    }

    cleanup() {
        this.instance = null
        this.isOnline.setData(false)
        this.waitingToShutdown = false
    }
}

export const serverManager = new ServerManager({})

process.on('SIGINT', async () => {
    const { success, promise } = await serverManager.stop(0)
    if (success) {
        console.log('Server process shutting down')
        await promise
        console.log('Server process stopped')
    }
    process.exit(64)
})

process.on('beforeExit', async code => {
    if (code === 64) return
    const { success, promise } = await serverManager.stop(0)
    if (success) {
        console.log('Server process shutting down')
        await promise
        console.log('Server process stopped')
    }
    process.exit(code)
})

process.on('exit', async code => {
    console.log(`Process exited with code ${code}`)
    process.exit(code)
})