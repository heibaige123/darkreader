/**
 * 用于存储 MediaQueryList 对象。该对象用于监听系统颜色模式的变化。
 */
let query: MediaQueryList | null = null;
/**
 * 包含 matches 属性，表示系统颜色模式是否匹配（是否是暗色模式）。
 * 遍历所有注册的监听器，并调用每个监听器，将当前系统颜色模式是否为暗色模式传递给它们。
 * @param param0
 * @returns
 */
const onChange: ({ matches }: { matches: boolean }) => void = ({ matches }) =>
    listeners.forEach((listener) => listener(matches));

/**
 * 存储注册的监听器函数。
 */
const listeners = new Set<(isDark: boolean) => void>();

/**
 * 用于运行颜色模式变化的检测。
 * @param callback 
 * @returns 
 */
export function runColorSchemeChangeDetector(
    callback: (isDark: boolean) => void,
): void {
    listeners.add(callback);
    if (query) {
        return;
    }
    query = matchMedia('(prefers-color-scheme: dark)');
    // MediaQueryList change event is not cancellable and does not bubble
    query.addEventListener('change', onChange);
}

/**
 * 用于停止颜色模式变化的检测。
 * @returns 
 */
export function stopColorSchemeChangeDetector(): void {
    if (!query || !onChange) {
        return;
    }
    query.removeEventListener('change', onChange);

    listeners.clear();
    query = null;
}

/**
 * 用于模拟指定的颜色模式（light 或 dark），并触发相应的回调函数通知。
 * @param colorScheme 
 */
export function emulateColorScheme(colorScheme: 'light' | 'dark'): void {}

/**
 * 用于检查系统是否启用了暗色模式。
 * @returns 
 */
export const isSystemDarkModeEnabled = (): boolean =>
    (query || matchMedia('(prefers-color-scheme: dark)')).matches;
