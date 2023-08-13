import './chrome';
import { setFetchMethod as setFetch } from './fetch';
import { DEFAULT_THEME } from '../defaults';
import type { Theme, DynamicThemeFix } from '../definitions';
import { ThemeEngine } from '../generators/theme-engines';
import {
    createOrUpdateDynamicThemeInternal,
    removeDynamicTheme,
} from '../inject/dynamic-theme';
// import { collectCSS } from '../inject/dynamic-theme/css-collection';

// let isDarkReaderEnabled = false;
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
    // isDarkReaderEnabled = true;
}

/**
 * 用于检查Dark Reader主题是否已启用。
 * @returns
 */
// function isEnabled(): boolean {
//     return isDarkReaderEnabled;
// }

/**
 * 用于禁用Dark Reader主题。
 */
export function disable(): void {
    removeDynamicTheme();
    // isDarkReaderEnabled = false;
}

// const darkScheme = matchMedia('(prefers-color-scheme: dark)');
// let store = {
//     themeOptions: null as Partial<Theme> | null,
//     fixes: null as DynamicThemeFix | null,
// };

/**
 * 根据当前的颜色方案（深色模式或浅色模式）来启用或禁用 Dark Reader 动态主题。
 */
// function handleColorScheme(): void {
//     if (darkScheme.matches) {
//         enable(store.themeOptions, store.fixes);
//     } else {
//         disable();
//     }
// }

/**
 * 用于根据用户的系统首选色彩方案自动启用或禁用Dark Reader主题。
 * @param themeOptions
 * @param fixes
 */
// function auto(
//     themeOptions: Partial<Theme> | false = {},
//     fixes: DynamicThemeFix | null = null,
// ): void {
//     if (themeOptions) {
//         store = { themeOptions, fixes };
//         handleColorScheme();
//         darkScheme.addEventListener('change', handleColorScheme);
//     } else {
//         darkScheme.removeEventListener('change', handleColorScheme);
//         disable();
//     }
// }

/**
 * 用于导出生成的CSS样式。
 * @returns
 */
// async function exportGeneratedCSS(): Promise<string> {
//     return await collectCSS();
// }

/**
 * 用于设置自定义的Fetch方法
 */
export const setFetchMethod = setFetch;
