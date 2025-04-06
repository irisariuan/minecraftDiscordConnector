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
}

export async function runCommandOnServer(command: string): Promise<boolean> {
    await fetch('http://localhost:6001/runCommand', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            command
        })
    })
    return true;
}

interface Player {
    name: string;
    id: string;
}

export async function fetchOnlinePlayers(): Promise<Player[]> {
    const res = await fetch('http://localhost:6001/onlinePlayers', {
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