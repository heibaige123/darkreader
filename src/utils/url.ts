import type { UserSettings, TabInfo } from '../definitions';
import { isIPV6, compareIPV6 } from './ipv6';

let anchor: HTMLAnchorElement;

/**
 * 用于缓存已经解析过的URLs，这样在将来需要再次解析相同的URL时，可以直接从缓存中获取，而不是重新解析，从而提高性能
 */
export const parsedURLCache = new Map<string, URL>();

/**
 * 修复并返回一个绝对的基URL
 */
function fixBaseURL($url: string): string {
    if (!anchor) {
        anchor = document.createElement('a');
    }
    anchor.href = $url;
    return anchor.href;
}

/**
 * 使用缓存解析和返回URL对象
 */
export function parseURL($url: string, $base: string | null = null): URL {
    const key = `${$url}${$base ? `;${$base}` : ''}`;
    if (parsedURLCache.has(key)) {
        return parsedURLCache.get(key)!;
    }
    if ($base) {
        const parsedURL = new URL($url, fixBaseURL($base));
        parsedURLCache.set(key, parsedURL);
        return parsedURL;
    }
    const parsedURL = new URL(fixBaseURL($url));
    parsedURLCache.set($url, parsedURL);
    return parsedURL;
}

/**
 * 将相对URL转换为绝对URL
 */
export function getAbsoluteURL($base: string, $relative: string): string {
    if ($relative.match(/^data\\?\:/)) {
        return $relative;
    }
    // Check if relative starts with `//hostname...`.
    // We have to add a protocol to make it absolute.
    if (/^\/\//.test($relative)) {
        return `${location.protocol}${$relative}`;
    }
    const b = parseURL($base);
    const a = parseURL($relative, b.href);
    return a.href;
}

// Check if any relative URL is on the window.location;
// So that https://duck.com/ext.css would return true on https://duck.com/
// But https://duck.com/styles/ext.css would return false on https://duck.com/
// Visa versa https://duck.com/ext.css should return fasle on https://duck.com/search/
// We're checking if any relative value within ext.css could potentially not be on the same path.
/**
 * 检查相对URL是否在window.location上
 * @param href 
 * @returns 
 */
export function isRelativeHrefOnAbsolutePath(href: string): boolean {
    if (href.startsWith('data:')) {
        return true;
    }
    const url = parseURL(href);

    if (url.protocol !== location.protocol) {
        return false;
    }
    if (url.hostname !== location.hostname) {
        return false;
    }
    if (url.port !== location.port) {
        return false;
    }
    // Now check if the path is on the same path as the base
    // We do this by getting the pathname up until the last slash.
    return url.pathname === location.pathname;
}

/**
 * 获取URL的主机或协议
 * @param $url 
 * @returns 
 */
export function getURLHostOrProtocol($url: string): string {
    const url = new URL($url);
    if (url.host) {
        return url.host;
    } else if (url.protocol === 'file:') {
        return url.pathname;
    }
    return url.protocol;
}

/**
 * 比较两个URL模式
 * @param a 
 * @param b 
 * @returns 
 */
export function compareURLPatterns(a: string, b: string): number {
    return a.localeCompare(b);
}

/**
 * Determines whether URL has a match in URL template list.
 * @param url Site URL.
 * @paramlist List to search into.
 */
/**
 * 判断URL是否在给定的列表中
 */
export function isURLInList(url: string, list: string[]): boolean {
    for (let i = 0; i < list.length; i++) {
        if (isURLMatched(url, list[i])) {
            return true;
        }
    }
    return false;
}

/**
 * Determines whether URL matches the template.
 * @param url URL.
 * @param urlTemplate URL template ("google.*", "youtube.com" etc).
 */
/**
 * 判断URL是否匹配给定的模板
 */
export function isURLMatched(url: string, urlTemplate: string): boolean {
    const isFirstIPV6 = isIPV6(url);
    const isSecondIPV6 = isIPV6(urlTemplate);
    if (isFirstIPV6 && isSecondIPV6) {
        return compareIPV6(url, urlTemplate);
    } else if (!isFirstIPV6 && !isSecondIPV6) {
        const regex = createUrlRegex(urlTemplate);
        return regex !== null && Boolean(url.match(regex));
    }
    return false;
}

/**
 * 根据给定的URL模板创建一个正则表达式。
 * @param urlTemplate 
 * @returns 
 */
function createUrlRegex(urlTemplate: string): RegExp | null {
    try {
        urlTemplate = urlTemplate.trim();
        const exactBeginning = urlTemplate[0] === '^';
        const exactEnding = urlTemplate[urlTemplate.length - 1] === '$';
        const hasLastSlash = /\/\$?$/.test(urlTemplate);

        urlTemplate = urlTemplate
            .replace(/^\^/, '') // Remove ^ at start
            .replace(/\$$/, '') // Remove $ at end
            .replace(/^.*?\/{2,3}/, '') // Remove scheme
            .replace(/\?.*$/, '') // Remove query
            .replace(/\/$/, ''); // Remove last slash

        let slashIndex: number;
        let beforeSlash: string;
        let afterSlash: string | undefined;
        if ((slashIndex = urlTemplate.indexOf('/')) >= 0) {
            beforeSlash = urlTemplate.substring(0, slashIndex); // google.*
            afterSlash = urlTemplate.replace(/\$/g, '').substring(slashIndex); // /login/abc
        } else {
            beforeSlash = urlTemplate.replace(/\$/g, '');
        }

        //
        // SCHEME and SUBDOMAINS

        let result = exactBeginning
            ? '^(.*?\\:\\/{2,3})?' // Scheme
            : '^(.*?\\:\\/{2,3})?([^/]*?\\.)?'; // Scheme and subdomains

        //
        // HOST and PORT

        const hostParts = beforeSlash.split('.');
        result += '(';
        for (let i = 0; i < hostParts.length; i++) {
            if (hostParts[i] === '*') {
                hostParts[i] = '[^\\.\\/]+?';
            }
        }
        result += hostParts.join('\\.');
        result += ')';

        //
        // PATH and QUERY

        if (afterSlash) {
            result += '(';
            result += afterSlash.replace('/', '\\/');
            result += ')';
        }

        result += exactEnding
            ? '(\\/?(\\?[^/]*?)?)$' // All following queries
            : `(\\/${hasLastSlash ? '' : '?'}.*?)$`; // All following paths and queries

        //
        // Result

        return new RegExp(result, 'i');
    } catch (e) {
        return null;
    }
}

/**
 * 判断URL是否指向一个PDF文件。
 * @param url 
 * @returns 
 */
export function isPDF(url: string): boolean {
    try {
        const { hostname, pathname } = new URL(url);
        if (pathname.includes('.pdf')) {
            if (
                (hostname.match(/(wikipedia|wikimedia)\.org$/i) &&
                    pathname.match(/^\/.*\/[a-z]+\:[^\:\/]+\.pdf/i)) ||
                (hostname.match(/timetravel\.mementoweb\.org$/i) &&
                    pathname.match(/^\/reconstruct/i) &&
                    pathname.match(/\.pdf$/i)) ||
                (hostname.match(/dropbox\.com$/i) &&
                    pathname.match(/^\/s\//i) &&
                    pathname.match(/\.pdf$/i))
            ) {
                return false;
            }
            if (pathname.endsWith('.pdf')) {
                for (let i = pathname.length; i >= 0; i--) {
                    if (pathname[i] === '=') {
                        return false;
                    } else if (pathname[i] === '/') {
                        return true;
                    }
                }
            } else {
                return false;
            }
        }
    } catch (e) {
        // Do nothing
    }
    return false;
}

/**
 * 判断URL是否在用户的设置中启用。
 * @param url 
 * @param userSettings 
 * @param param2 
 * @param isAllowedFileSchemeAccess 
 * @returns 
 */
export function isURLEnabled(
    url: string,
    userSettings: UserSettings,
    { isProtected, isInDarkList, isDarkThemeDetected }: Partial<TabInfo>,
    isAllowedFileSchemeAccess = true,
): boolean {
    if (isLocalFile(url) && !isAllowedFileSchemeAccess) {
        return false;
    }
    if (isProtected && !userSettings.enableForProtectedPages) {
        return false;
    }
    // Only URL's with emails are getting here on thunderbird
    // So we can skip the checks and just return true.

    if (isPDF(url)) {
        return userSettings.enableForPDF;
    }
    const isURLInUserList = isURLInList(url, userSettings.siteList);
    const isURLInEnabledList = isURLInList(url, userSettings.siteListEnabled);

    if (userSettings.applyToListedOnly) {
        return isURLInEnabledList || isURLInUserList;
    }
    if (isURLInEnabledList) {
        return true;
    }
    if (isInDarkList || (userSettings.detectDarkTheme && isDarkThemeDetected)) {
        return false;
    }
    return !isURLInUserList;
}

/**
 * 判断字符串是否是一个完全合格的域名。
 * @param candidate 
 * @returns 
 */
export function isFullyQualifiedDomain(candidate: string): boolean {
    return /^[a-z0-9\.\-]+$/i.test(candidate) && candidate.indexOf('..') === -1;
}

/**
 * 判断字符串是否是一个带通配符的完全合格的域名。
 * @param candidate 
 * @returns 
 */
export function isFullyQualifiedDomainWildcard(candidate: string): boolean {
    if (!candidate.includes('*') || !/^[a-z0-9\.\-\*]+$/i.test(candidate)) {
        return false;
    }
    const labels = candidate.split('.');
    for (const label of labels) {
        if (label !== '*' && !/^[a-z0-9\-]+$/i.test(label)) {
            return false;
        }
    }
    return true;
}

/**
 * 检查给定的域名是否匹配给定的通配符。
 * @param wildcard 
 * @param candidate 
 * @returns 
 */
export function fullyQualifiedDomainMatchesWildcard(
    wildcard: string,
    candidate: string,
): boolean {
    const wildcardLabels = wildcard.toLowerCase().split('.');
    const candidateLabels = candidate.toLowerCase().split('.');
    if (candidateLabels.length < wildcardLabels.length) {
        return false;
    }
    while (wildcardLabels.length) {
        const wildcardLabel = wildcardLabels.pop();
        const candidateLabel = candidateLabels.pop();
        if (wildcardLabel !== '*' && wildcardLabel !== candidateLabel) {
            return false;
        }
    }
    return true;
}

/**
 * 判断URL是否指向一个本地文件。
 * @param url 
 * @returns 
 */
export function isLocalFile(url: string): boolean {
    return Boolean(url) && url.startsWith('file:///');
}
