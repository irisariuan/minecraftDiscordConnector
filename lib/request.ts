export type LogType = 'info' | 'warn' | 'error';
export interface LogLine {
    timestamp: string;
    type: LogType;
    message: string;
}

export async function getLogs(): Promise<LogLine[]> {
    //todo: call api to get logs
    return [
        {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: 'This is a test log message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'warn',
            message: 'This is a test warning message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'error',
            message: 'This is a test error message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: 'This is a test log message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'warn',
            message: 'This is a test warning message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'error',
            message: 'This is a test error message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: 'This is a test log message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'warn',
            message: 'This is a test warning message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'error',
            message: 'This is a test error message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: 'This is a test log message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'warn',
            message: 'This is a test warning message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'error',
            message: 'This is a test error message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: 'This is a test log message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'warn',
            message: 'This is a test warning message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'error',
            message: 'This is a test error message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: 'This is a test log message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'warn',
            message: 'This is a test warning message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'error',
            message: 'This is a test error message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: 'This is a test log message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'warn',
            message: 'This is a test warning message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'error',
            message: 'This is a test error message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: 'This is a test log message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'warn',
            message: 'This is a test warning message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'error',
            message: 'This is a test error message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: 'This is a test log message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'warn',
            message: 'This is a test warning message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'error',
            message: 'This is a test error message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: 'This is a test log message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'warn',
            message: 'This is a test warning message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'error',
            message: 'This is a test error message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: 'This is a test log message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'warn',
            message: 'This is a test warning message'
        },
        {
            timestamp: new Date().toISOString(),
            type: 'error',
            message: 'This is a test error message'
        }
    ]
}

export async function runCommandOnServer(command: string): Promise<boolean> {
    //todo: call api to run command on server
    return true;
}