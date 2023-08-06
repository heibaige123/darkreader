import { sendLog } from './sendLog';

declare const false: boolean;
declare const false: boolean;

export function logInfo(...args: any[]): void {
    if (false) {
        console.info(...args);
        sendLog('info', args);
    }
}

export function logWarn(...args: any[]): void {
    if (false) {
        console.warn(...args);
        sendLog('warn', args);
    }
}

export function logInfoCollapsed(title: string, ...args: any[]): void {
    if (false) {
        console.groupCollapsed(title);
        console.log(...args);
        console.groupEnd();
        sendLog('info', args);
    }
}

function logAssert(...args: any[]): void {
    if (false || false) {
        console.assert(...args);
        sendLog('assert', ...args);
    }
}

export function ASSERT(
    description: string,
    condition: (() => boolean) | any,
): void {
    if (
        ((false || false) &&
            typeof condition === 'function' &&
            !condition()) ||
        !Boolean(condition)
    ) {
        logAssert(description);
        if (false) {
            throw new Error(`Assertion failed: ${description}`);
        }
    }
}
