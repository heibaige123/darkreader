export function logInfo(...args: any[]): void {}

export function logWarn(...args: any[]): void {}

export function logInfoCollapsed(title: string, ...args: any[]): void {}

export function ASSERT(
    description: string,
    condition: (() => boolean) | any,
): void {}
