import './chrome';
import { setFetchMethod as setFetch } from './fetch';
import { DEFAULT_THEME } from '../defaults';
import type { Theme, DynamicThemeFix } from '../definitions';
import { ThemeEngine } from '../generators/theme-engines';
import {
    createOrUpdateDynamicThemeInternal,
    removeDynamicTheme,
} from '../inject/dynamic-theme';

/**
 * 判断当前页面是否运行在iframe
 */
const isIFrame = (() => {
    try {
        return window.self !== window.top;
    } catch (err) {
        console.warn(err);
        return true;
    }
})();

/**
 * 用于启用Dark Reader主题。
 * @param themeOptions
 * @param fixes
 */
export function enable(
    themeOptions: Partial<Theme> | null = {},
    fixes: DynamicThemeFix | null = null,
): void {
    const theme = { ...DEFAULT_THEME, ...themeOptions };

    if (theme.engine !== ThemeEngine.dynamicTheme) {
        throw new Error('Theme engine is not supported.');
    }
    // TODO: repalce with createOrUpdateDynamicTheme() and make fixes signature
    // DynamicThemeFix | DynamicThemeFix[]
    createOrUpdateDynamicThemeInternal(theme, fixes, isIFrame);
}

/**
 * 用于禁用Dark Reader主题。
 */
export function disable(): void {
    removeDynamicTheme();
}

/**
 * 用于设置自定义的Fetch方法
 */
export const setFetchMethod = setFetch;
