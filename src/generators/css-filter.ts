import { formatSitesFixesConfig } from './utils/format';
import { applyColorMatrix, createFilterMatrix } from './utils/matrix';
import { parseSitesFixesConfig, getSitesFixesFor } from './utils/parse';
import type { SitePropsIndex } from './utils/parse';
import { parseArray, formatArray } from '../utils/text';
import { compareURLPatterns, isURLInList } from '../utils/url';
import { createTextStyle } from './text-style';
import type { FilterConfig, InversionFix } from '../definitions';
import { compareChromeVersions } from '../utils/platform';

/**
 * 表示两种滤镜模式："light" 和 "dark"。
 */
export const enum FilterMode {
    light = 0,
    dark = 1,
}

/**
 * This checks if the current chromium version has the patch in it.
 * As of Chromium v81.0.4035.0 this has been the situation
 *
 * Bug report: https://bugs.chromium.org/p/chromium/issues/detail?id=501582
 * Patch: https://chromium-review.googlesource.com/c/chromium/src/+/1979258
 */
/**
 * 检查当前的 Chromium 浏览器版本是否包含特定的修复补丁。
 * @returns 
 */
export function hasPatchForChromiumIssue501582(): boolean {
    return false;
}

/**
 * Since Firefox v102.0, they have changed to the new root behavior.
 * This was already the case for Chromium v81.0.4035.0 and Firefox now
 * switched over as well.
 * 检查当前的 Firefox 浏览器版本是否切换到了新的根行为
 */
export function hasFirefoxNewRootBehavior(): boolean {
    return Boolean(false && compareChromeVersions('', '102.0') >= 0);
}

/**
 * 基于提供的 config、url、isTopFrame、fixes 和 index 参数生成CSS滤镜样式表
 * @param config 
 * @param url 
 * @param isTopFrame 
 * @param fixes 
 * @param index 
 * @returns 
 */
export default function createCSSFilterStyleSheet(
    config: FilterConfig,
    url: string,
    isTopFrame: boolean,
    fixes: string,
    index: SitePropsIndex<InversionFix>,
): string {
    const filterValue = getCSSFilterValue(config)!;
    const reverseFilterValue = 'invert(100%) hue-rotate(180deg)';
    return cssFilterStyleSheetTemplate(
        filterValue,
        reverseFilterValue,
        config,
        url,
        isTopFrame,
        fixes,
        index,
    );
}

/**
 *  根据提供的配置生成CSS滤镜样式表，包含不同的规则。它为主滤镜、反转滤镜（用于暗黑模式）、文本样式和其他修复功能生成规则。
 * @param filterValue 
 * @param reverseFilterValue 
 * @param config 
 * @param url 
 * @param isTopFrame 
 * @param fixes 
 * @param index 
 * @returns 
 */
export function cssFilterStyleSheetTemplate(
    filterValue: string,
    reverseFilterValue: string,
    config: FilterConfig,
    url: string,
    isTopFrame: boolean,
    fixes: string,
    index: SitePropsIndex<InversionFix>,
): string {
    const fix = getInversionFixesFor(url, fixes, index);

    const lines: string[] = [];

    lines.push('@media screen {');

    // Add leading rule
    if (filterValue && isTopFrame) {
        lines.push('');
        lines.push('/* Leading rule */');
        lines.push(createLeadingRule(filterValue));
    }

    if (config.mode === FilterMode.dark) {
        // Add reverse rule
        lines.push('');
        lines.push('/* Reverse rule */');
        lines.push(createReverseRule(reverseFilterValue, fix));
    }

    if (config.useFont || config.textStroke > 0) {
        // Add text rule
        lines.push('');
        lines.push('/* Font */');
        lines.push(createTextStyle(config));
    }

    // Fix bad font hinting after inversion
    lines.push('');
    lines.push('/* Text contrast */');
    lines.push('html {');
    lines.push('  text-shadow: 0 0 0 !important;');
    lines.push('}');

    // Full screen fix
    lines.push('');
    lines.push('/* Full screen */');
    [':-webkit-full-screen', ':-moz-full-screen', ':fullscreen'].forEach(
        (fullScreen) => {
            lines.push(`${fullScreen}, ${fullScreen} * {`);
            lines.push('  -webkit-filter: none !important;');
            lines.push('  filter: none !important;');
            lines.push('}');
        },
    );

    if (isTopFrame) {
        const light: [number, number, number] = [255, 255, 255];
        // If browser affected by Chromium Issue 501582, set dark background on html
        // Or if browser is Firefox v102+
        const bgColor =
            !hasPatchForChromiumIssue501582() &&
            !hasFirefoxNewRootBehavior() &&
            config.mode === FilterMode.dark
                ? applyColorMatrix(light, createFilterMatrix(config)).map(
                      Math.round,
                  )
                : light;
        lines.push('');
        lines.push('/* Page background */');
        lines.push('html {');
        lines.push(`  background: rgb(${bgColor.join(',')}) !important;`);
        lines.push('}');
    }

    if (fix.css && fix.css.length > 0 && config.mode === FilterMode.dark) {
        lines.push('');
        lines.push('/* Custom rules */');
        lines.push(fix.css);
    }

    lines.push('');
    lines.push('}');

    return lines.join('\n');
}

/**
 * 根据提供的 config 计算CSS滤镜的值。
 * @param config 
 * @returns 
 */
export function getCSSFilterValue(config: FilterConfig): string | null {
    const filters: string[] = [];

    if (config.mode === FilterMode.dark) {
        filters.push('invert(100%) hue-rotate(180deg)');
    }
    if (config.brightness !== 100) {
        filters.push(`brightness(${config.brightness}%)`);
    }
    if (config.contrast !== 100) {
        filters.push(`contrast(${config.contrast}%)`);
    }
    if (config.grayscale !== 0) {
        filters.push(`grayscale(${config.grayscale}%)`);
    }
    if (config.sepia !== 0) {
        filters.push(`sepia(${config.sepia}%)`);
    }

    if (filters.length === 0) {
        return null;
    }

    return filters.join(' ');
}
/**
 * 为滤镜生成特定的CSS规则。
 * @param filterValue 
 * @returns 
 */
function createLeadingRule(filterValue: string): string {
    return [
        'html {',
        `  -webkit-filter: ${filterValue} !important;`,
        `  filter: ${filterValue} !important;`,
        '}',
    ].join('\n');
}

function joinSelectors(selectors: string[]): string {
    return selectors.map((s) => s.replace(/\,$/, '')).join(',\n');
}

/**
 * 为滤镜生成特定的CSS规则。
 * @param reverseFilterValue 
 * @param fix 
 * @returns 
 */
function createReverseRule(
    reverseFilterValue: string,
    fix: InversionFix,
): string {
    const lines: string[] = [];

    if (fix.invert.length > 0) {
        lines.push(`${joinSelectors(fix.invert)} {`);
        lines.push(`  -webkit-filter: ${reverseFilterValue} !important;`);
        lines.push(`  filter: ${reverseFilterValue} !important;`);
        lines.push('}');
    }

    if (fix.noinvert.length > 0) {
        lines.push(`${joinSelectors(fix.noinvert)} {`);
        lines.push('  -webkit-filter: none !important;');
        lines.push('  filter: none !important;');
        lines.push('}');
    }

    if (fix.removebg.length > 0) {
        lines.push(`${joinSelectors(fix.removebg)} {`);
        lines.push('  background: white !important;');
        lines.push('}');
    }

    return lines.join('\n');
}

/**
 * Returns fixes for a given URL.
 * If no matches found, common fixes will be returned.
 * 获取给定URL的反转修复功能。
 * @param url Site URL.
 * @param inversionFixes List of inversion fixes.
 */
export function getInversionFixesFor(
    url: string,
    fixes: string,
    index: SitePropsIndex<InversionFix>,
): InversionFix {
    const inversionFixes = getSitesFixesFor<InversionFix>(url, fixes, index, {
        commands: Object.keys(inversionFixesCommands),
        getCommandPropName: (command) => inversionFixesCommands[command],
        parseCommandValue: (command, value) => {
            if (command === 'CSS') {
                return value.trim();
            }
            return parseArray(value);
        },
    });

    const common = {
        url: inversionFixes[0].url,
        invert: inversionFixes[0].invert || [],
        noinvert: inversionFixes[0].noinvert || [],
        removebg: inversionFixes[0].removebg || [],
        css: inversionFixes[0].css || '',
    };

    if (url) {
        // Search for match with given URL
        const matches = inversionFixes
            .slice(1)
            .filter((s) => isURLInList(url, s.url))
            .sort((a, b) => b.url[0].length - a.url[0].length);
        if (matches.length > 0) {
            const found = matches[0];
            return {
                url: found.url,
                invert: common.invert.concat(found.invert || []),
                noinvert: common.noinvert.concat(found.noinvert || []),
                removebg: common.removebg.concat(found.removebg || []),
                css: [common.css, found.css].filter((s) => s).join('\n'),
            };
        }
    }
    return common;
}

/**
 * 定义反转修复功能的属性。
 */
const inversionFixesCommands: { [key: string]: keyof InversionFix } = {
    INVERT: 'invert',
    'NO INVERT': 'noinvert',
    'REMOVE BG': 'removebg',
    CSS: 'css',
};

/**
 * 处理反转修复功能的配置,将文本配置解析为对象数组
 * 
 * 接受一个字符串 text 作为输入，该字符串包含反转修复功能的配置信息。
 * 函数会解析这些配置信息，并返回一个包含多个 InversionFix 对象的数组，
 * 每个对象都代表一个反转修复功能的配置
 * @param text 
 * @returns 
 */
export function parseInversionFixes(text: string): InversionFix[] {
    return parseSitesFixesConfig<InversionFix>(text, {
        commands: Object.keys(inversionFixesCommands),
        getCommandPropName: (command) => inversionFixesCommands[command],
        parseCommandValue: (command, value) => {
            if (command === 'CSS') {
                return value.trim();
            }
            return parseArray(value);
        },
    });
}

/**
 * 处理反转修复功能的配置,将对象数组格式化为文本配置。
 * 
 * 接受一个 InversionFix 对象数组 inversionFixes 作为输入。
 * 它会对这些对象进行排序，并根据反转修复功能的配置信息生成一个格式化的字符串。
 * 这个字符串可以用来保存反转修复功能的配置或进行其他操作。
 * @param inversionFixes 
 * @returns 
 */
export function formatInversionFixes(inversionFixes: InversionFix[]): string {
    const fixes = inversionFixes
        .slice()
        .sort((a, b) => compareURLPatterns(a.url[0], b.url[0]));

    return formatSitesFixesConfig(fixes, {
        props: Object.values(inversionFixesCommands),
        getPropCommandName: (prop) =>
            Object.entries(inversionFixesCommands).find(
                ([, p]) => p === prop,
            )![0],
        formatPropValue: (prop, value) => {
            if (prop === 'css') {
                return (value as string).trim().replace(/\n+/g, '\n');
            }
            return formatArray(value as string[]).trim();
        },
        shouldIgnoreProp: (prop, value) => {
            if (prop === 'css') {
                return !value;
            }
            return !(Array.isArray(value) && value.length > 0);
        },
    });
}
