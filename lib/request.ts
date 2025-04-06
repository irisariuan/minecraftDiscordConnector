export type LogType = 'info' | 'warn' | 'error';
export interface LogLine {
    timestamp: string;
    type: LogType;
    message: string;
}

export async function getLogs(): Promise<LogLine[]> {
    const res = await fetch('http://localhost:6001/logs')
    if (!res.ok) {
        throw new Error('Failed to fetch logs')
    }
    const data = await res.json()
    if (!Array.isArray(data)) {
        throw new Error('Invalid logs format')
    }
    return data
}

export async function runCommandOnServer(command: string) {
    const res = await fetch('http://localhost:6001/runCommand', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            command
        })
    })
    if (!res.ok) {
        return { success: false, output: null, logger: null }
    }
    const data = await res.json() as { success: boolean, output: string, logger: string };
    return data;
}

export interface Player {
    name: string;
    uuid: string;
}

export async function fetchOnlinePlayers(): Promise<Player[]> {
    const res = await fetch('http://localhost:6001/players', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    if (!res.ok) {
        throw new Error('Failed to fetch online players');
    }
    const data = await res.json() as Player[];
    return data;
}

export function parseCommandOutput(output: string | null, success: boolean) {
    if (!success) {
        return 'Command execution failed';
    }
    return output ? `Command executed successfully\nOutput: \`${output}\`` : 'No output returned from the command.'
}