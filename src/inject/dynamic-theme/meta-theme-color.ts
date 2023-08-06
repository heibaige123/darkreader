import { parseColorWithCache } from '../../utils/color';
import { modifyBackgroundColor } from '../../generators/modify-colors';
import { logWarn } from '../utils/log';
import type { FilterConfig } from '../../definitions';

const metaThemeColorName = 'theme-color';
const metaThemeColorSelector = `meta[name="${metaThemeColorName}"]`;
let srcMetaThemeColor: string | null = null;
let observer: MutationObserver | null = null;

/**
 * 用于改变 meta 元素中的主题颜色。
 * @param meta 
 * @param theme 
 * @returns 
 */
function changeMetaThemeColor(meta: HTMLMetaElement, theme: FilterConfig) {
    srcMetaThemeColor = srcMetaThemeColor || meta.content;
    const color = parseColorWithCache(srcMetaThemeColor);
    if (!color) {
        logWarn('Invalid meta color', color);
        return;
    }
    meta.content = modifyBackgroundColor(color, theme);
}

/**
 * 用于在可用时改变网页的主题颜色。
 * @param theme 
 */
export function changeMetaThemeColorWhenAvailable(theme: FilterConfig): void {
    const meta: HTMLMetaElement = document.querySelector(
        metaThemeColorSelector,
    )!;
    if (meta) {
        changeMetaThemeColor(meta, theme);
    } else {
        if (observer) {
            observer.disconnect();
        }
        observer = new MutationObserver((mutations) => {
            loop: for (let i = 0; i < mutations.length; i++) {
                const { addedNodes } = mutations[i];
                for (let j = 0; j < addedNodes.length; j++) {
                    const node = addedNodes[j];
                    if (
                        node instanceof HTMLMetaElement &&
                        node.name === metaThemeColorName
                    ) {
                        observer!.disconnect();
                        observer = null;
                        changeMetaThemeColor(node, theme);
                        break loop;
                    }
                }
            }
        });
        observer.observe(document.head, { childList: true });
    }
}

/**
 * 用于恢复原始的主题颜色。
 */
export function restoreMetaThemeColor(): void {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    const meta = document.querySelector(
        metaThemeColorSelector,
    ) as HTMLMetaElement;
    if (meta && srcMetaThemeColor) {
        meta.content = srcMetaThemeColor;
    }
}
