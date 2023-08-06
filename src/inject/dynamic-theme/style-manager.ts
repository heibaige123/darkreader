import type { Theme } from '../../definitions';
import { forEach } from '../../utils/array';
import { getMatches } from '../../utils/text';
import { getAbsoluteURL, isRelativeHrefOnAbsolutePath } from '../../utils/url';
import {
    watchForNodePosition,
    removeNode,
    iterateShadowHosts,
    addReadyStateCompleteListener,
} from '../utils/dom';
import { logInfo, logWarn } from '../utils/log';
import {
    replaceCSSRelativeURLsWithAbsolute,
    removeCSSComments,
    replaceCSSFontFace,
    getCSSURLValue,
    cssImportRegex,
    getCSSBaseBath,
} from './css-rules';
import { bgFetch } from './network';
import { createStyleSheetModifier } from './stylesheet-modifier';

declare global {
    interface Document {
        adoptedStyleSheets: CSSStyleSheet[];
    }
    interface ShadowRoot {
        adoptedStyleSheets: CSSStyleSheet[];
    }
    interface CSSStyleSheet {
        replaceSync(text: string): void;
    }
}

/**
 * 定义了一个元素数组，其中的元素是 HTMLStyleElement 类
 */
export type StyleElement = HTMLLinkElement | HTMLStyleElement;

/**
 * 用于指定样式元素和详情参数的类型
 */
export type detailsArgument = { secondRound: boolean };
/**
 * 一个管理样式的接口，包括了如何创建、更新和删除样式的方法。
 */
export interface StyleManager {
    details(options: detailsArgument): { rules: CSSRuleList } | null;
    render(theme: Theme, ignoreImageAnalysis: string[]): void;
    pause(): void;
    destroy(): void;
    watch(): void;
    restore(): void;
}

/**
 * 用于选择样式元素的选择器。它匹配所有的 style 元素和带有 rel 属性包含 "stylesheet" 的非禁用 link 元素
 */
export const STYLE_SELECTOR =
    'style, link[rel*="stylesheet" i]:not([disabled])';

// isFontsGoogleApiStyle returns is the given link element is a style from
// google fonts.
/**
 * 用于检查给定的 link 元素是否是来自 Google Fonts API 的样式。
 * 它通过解析链接中的主机名来判断是否使用了 Google Fonts API
 * @param element 
 * @returns 
 */
function isFontsGoogleApiStyle(element: HTMLLinkElement): boolean {
    if (!element.href) {
        return false;
    }

    try {
        const elementURL = new URL(element.href);
        return elementURL.hostname === 'fonts.googleapis.com';
    } catch (err) {
        logInfo(`Couldn't construct ${element.href} as URL`);
        return false;
    }
}

/**
 * 用于检查给定的节点是否应该由样式管理器来管理。
 * @param element 
 * @returns 
 */
export function shouldManageStyle(element: Node | null): boolean {
    return (
        (element instanceof HTMLStyleElement ||
            element instanceof SVGStyleElement ||
            (element instanceof HTMLLinkElement &&
                Boolean(element.rel) &&
                element.rel.toLowerCase().includes('stylesheet') &&
                Boolean(element.href) &&
                !element.disabled &&
                !isFontsGoogleApiStyle(element))) &&
        !element.classList.contains('darkreader') &&
        element.media.toLowerCase() !== 'print' &&
        !element.classList.contains('stylus')
    );
}

/**
 * 用于获取可管理的样式元素。
 * @param node 
 * @param results 
 * @param deep 
 * @returns 
 */
export function getManageableStyles(
    node: Node | null,
    results: StyleElement[] = [],
    deep = true,
): StyleElement[] {
    if (shouldManageStyle(node)) {
        results.push(node as StyleElement);
    } else if (
        node instanceof Element ||
        (true && node instanceof ShadowRoot) ||
        node === document
    ) {
        forEach(
            (node as Element).querySelectorAll(STYLE_SELECTOR),
            (style: StyleElement) => getManageableStyles(style, results, false),
        );
        if (deep) {
            iterateShadowHosts(node, (host) =>
                getManageableStyles(host.shadowRoot, results, false),
            );
        }
    }
    return results;
}

/**
 * 用于存储 sync 样式元素，防止重复管理。
 */
const syncStyleSet = new WeakSet<HTMLStyleElement | SVGStyleElement>();
/**
 * 用于存储 cors 样式元素，防止重复管理。
 */
const corsStyleSet = new WeakSet<HTMLStyleElement>();

/**
 * 用于表示是否可以使用代理优化样式。
 */
let canOptimizeUsingProxy = false;
document.addEventListener(
    '__darkreader__inlineScriptsAllowed',
    () => {
        canOptimizeUsingProxy = true;
    },
    { once: true, passive: true },
);

/**
 * 用于给加载中的链接元素分配一个唯一的标识符。
 */
let loadingLinkCounter = 0;
/**
 * 用于存储加载中的链接元素的拒绝函数。
 * 当链接元素加载完成或出现错误时，可以调用相应的拒绝函数来解决或拒绝 Promise。
 */
const rejectorsForLoadingLinks = new Map<number, (reason?: any) => void>();

/**
 * 用于清除存储在 rejectorsForLoadingLinks 常量中的拒绝函数。
 */
export function cleanLoadingLinks(): void {
    rejectorsForLoadingLinks.clear();
}

/**
 * 用于管理样式元素。它接受一个样式元素和一个对象，
 * 其中包含 update、loadingStart 和 loadingEnd 函数。这些函数在样式需要更新
 * @param element 
 * @param param1 
 * @returns 
 */
export function manageStyle(
    element: StyleElement,
    {
        update,
        loadingStart,
        loadingEnd,
    }: { update: () => void; loadingStart: () => void; loadingEnd: () => void },
): StyleManager {
    const prevStyles: HTMLStyleElement[] = [];
    let next: Element | null = element;
    while ((next = next.nextElementSibling) && next.matches('.darkreader')) {
        prevStyles.push(next as HTMLStyleElement);
    }
    let corsCopy: HTMLStyleElement | null =
        prevStyles.find(
            (el) => el.matches('.darkreader--cors') && !corsStyleSet.has(el),
        ) || null;
    let syncStyle: HTMLStyleElement | SVGStyleElement | null =
        prevStyles.find(
            (el) => el.matches('.darkreader--sync') && !syncStyleSet.has(el),
        ) || null;

    let corsCopyPositionWatcher: ReturnType<
        typeof watchForNodePosition
    > | null = null;
    let syncStylePositionWatcher: ReturnType<
        typeof watchForNodePosition
    > | null = null;

    let cancelAsyncOperations = false;
    let isOverrideEmpty = true;

    const sheetModifier = createStyleSheetModifier();

    const observer = new MutationObserver(() => {
        update();
    });
    const observerOptions: MutationObserverInit = {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
    };

    function containsCSSImport() {
        return (
            element instanceof HTMLStyleElement &&
            element.textContent!.trim().match(cssImportRegex)
        );
    }

    // It loops trough the cssRules and check for CSSImportRule and their `href`.
    // If the `href` isn't local and doesn't start with the same-origin.
    // We can be ensure that's a cross-origin import
    // And should add a cors-sheet to this element.
    function hasImports(
        cssRules: CSSRuleList | null,
        checkCrossOrigin: boolean,
    ) {
        let result = false;
        if (cssRules) {
            let rule: CSSRule;
            cssRulesLoop: for (let i = 0, len = cssRules.length; i < len; i++) {
                rule = cssRules[i];
                if ((rule as CSSImportRule).href) {
                    if (checkCrossOrigin) {
                        if (
                            !(rule as CSSImportRule).href.startsWith(
                                'https://fonts.googleapis.com/',
                            ) &&
                            (rule as CSSImportRule).href.startsWith('http') &&
                            !(rule as CSSImportRule).href.startsWith(
                                location.origin,
                            )
                        ) {
                            result = true;
                            break cssRulesLoop;
                        }
                    } else {
                        result = true;
                        break cssRulesLoop;
                    }
                }
            }
        }
        return result;
    }

    function getRulesSync(): CSSRuleList | null {
        if (corsCopy) {
            logInfo('[getRulesSync] Using cors-copy.');
            return corsCopy.sheet!.cssRules;
        }
        if (containsCSSImport()) {
            logInfo('[getRulesSync] CSSImport detected.');
            return null;
        }

        const cssRules = safeGetSheetRules();
        if (
            element instanceof HTMLLinkElement &&
            !isRelativeHrefOnAbsolutePath(element.href) &&
            hasImports(cssRules, false)
        ) {
            logInfo('[getRulesSync] CSSImportRule detected on non-local href.');
            return null;
        }

        if (hasImports(cssRules, true)) {
            logInfo('[getRulesSync] Cross-Origin CSSImportRule detected.');
            return null;
        }

        logInfo('[getRulesSync] Using cssRules.');
        !cssRules && logWarn('[getRulesSync] cssRules is null, trying again.');
        return cssRules;
    }

    function insertStyle() {
        if (corsCopy) {
            if (element.nextSibling !== corsCopy) {
                element.parentNode!.insertBefore(corsCopy, element.nextSibling);
            }
            if (corsCopy.nextSibling !== syncStyle) {
                element.parentNode!.insertBefore(
                    syncStyle!,
                    corsCopy.nextSibling,
                );
            }
        } else if (element.nextSibling !== syncStyle) {
            element.parentNode!.insertBefore(syncStyle!, element.nextSibling);
        }
    }

    function createSyncStyle() {
        syncStyle =
            element instanceof SVGStyleElement
                ? document.createElementNS(
                      'http://www.w3.org/2000/svg',
                      'style',
                  )
                : document.createElement('style');
        syncStyle.classList.add('darkreader');
        syncStyle.classList.add('darkreader--sync');
        syncStyle.media = 'screen';
        if (element.title) {
            syncStyle.title = element.title;
        }
        syncStyleSet.add(syncStyle);
    }

    let isLoadingRules = false;
    let wasLoadingError = false;
    const loadingLinkId = ++loadingLinkCounter;

    async function getRulesAsync(): Promise<CSSRuleList | null> {
        let cssText: string;
        let cssBasePath: string;

        if (element instanceof HTMLLinkElement) {
            let [cssRules, accessError] = getRulesOrError();
            if (accessError) {
                logWarn(accessError);
            }

            if (
                (false && !element.sheet) ||
                (!false && !cssRules && !accessError) ||
                isStillLoadingError(accessError!)
            ) {
                try {
                    logInfo(
                        `Linkelement ${loadingLinkId} is not loaded yet and thus will be await for`,
                        element,
                    );
                    await linkLoading(element, loadingLinkId);
                } catch (err) {
                    // NOTE: Some @import resources can fail,
                    // but the style sheet can still be valid.
                    // There's no way to get the actual error.
                    logWarn(err);
                    wasLoadingError = true;
                }
                if (cancelAsyncOperations) {
                    return null;
                }

                [cssRules, accessError] = getRulesOrError();
                if (accessError) {
                    // CORS error, cssRules are not accessible
                    // for cross-origin resources
                    logWarn(accessError);
                }
            }

            if (cssRules) {
                if (!hasImports(cssRules, false)) {
                    return cssRules;
                }
            }

            cssText = await loadText(element.href);
            cssBasePath = getCSSBaseBath(element.href);
            if (cancelAsyncOperations) {
                return null;
            }
        } else if (containsCSSImport()) {
            cssText = element.textContent!.trim();
            cssBasePath = getCSSBaseBath(location.href);
        } else {
            return null;
        }

        if (cssText) {
            // Sometimes cross-origin stylesheets are protected from direct access
            // so need to load CSS text and insert it into style element
            try {
                const fullCSSText = await replaceCSSImports(
                    cssText,
                    cssBasePath,
                );
                corsCopy = createCORSCopy(element, fullCSSText);
            } catch (err) {
                logWarn(err);
            }
            if (corsCopy) {
                corsCopyPositionWatcher = watchForNodePosition(
                    corsCopy,
                    'prev-sibling',
                );
                return corsCopy.sheet!.cssRules;
            }
        }

        return null;
    }

    function details(options: detailsArgument) {
        const rules = getRulesSync();
        if (!rules) {
            // secondRound is only true after it's
            // has gone trough `details()` & `getRulesAsync` already
            // So that means that `getRulesSync` shouldn't fail.
            // However as a fail-safe to prevent loops, we should
            // return null here and not continue to `getRulesAsync`
            if (options.secondRound) {
                logWarn(
                    'Detected dead-lock at details(), returning early to prevent it.',
                );
                return null;
            }
            if (isLoadingRules || wasLoadingError) {
                return null;
            }
            isLoadingRules = true;
            loadingStart();
            getRulesAsync()
                .then((results) => {
                    isLoadingRules = false;
                    loadingEnd();
                    if (results) {
                        update();
                    }
                })
                .catch((err) => {
                    logWarn(err);
                    isLoadingRules = false;
                    loadingEnd();
                });
            return null;
        }
        return { rules };
    }

    let forceRenderStyle = false;

    function render(theme: Theme, ignoreImageAnalysis: string[]) {
        const rules = getRulesSync();
        if (!rules) {
            return;
        }

        cancelAsyncOperations = false;

        function removeCSSRulesFromSheet(sheet: CSSStyleSheet) {
            if (!sheet) {
                return;
            }
            for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
                sheet.deleteRule(i);
            }
        }

        function prepareOverridesSheet(): CSSStyleSheet {
            if (!syncStyle) {
                createSyncStyle();
            }

            syncStylePositionWatcher && syncStylePositionWatcher.stop();
            insertStyle();

            // Firefox issue: Some websites get CSP warning,
            // when `textContent` is not set (e.g. pypi.org).
            // But for other websites (e.g. facebook.com)
            // some images disappear when `textContent`
            // is initially set to an empty string.
            if (syncStyle!.sheet == null) {
                syncStyle!.textContent = '';
            }

            const sheet = syncStyle!.sheet;

            removeCSSRulesFromSheet(sheet!);

            if (syncStylePositionWatcher) {
                syncStylePositionWatcher.run();
            } else {
                syncStylePositionWatcher = watchForNodePosition(
                    syncStyle!,
                    'prev-sibling',
                    () => {
                        forceRenderStyle = true;
                        buildOverrides();
                    },
                );
            }

            return syncStyle!.sheet!;
        }

        function buildOverrides() {
            const force = forceRenderStyle;
            forceRenderStyle = false;
            sheetModifier.modifySheet({
                prepareSheet: prepareOverridesSheet,
                sourceCSSRules: rules!,
                theme,
                ignoreImageAnalysis,
                force,
                isAsyncCancelled: () => cancelAsyncOperations,
            });
            isOverrideEmpty = syncStyle!.sheet!.cssRules.length === 0;
            if (sheetModifier.shouldRebuildStyle()) {
                // "update" function schedules rebuilding the style
                // ideally to wait for link loading, because some sites put links any time,
                // but it can be complicated, so waiting for document completion can do the trick
                addReadyStateCompleteListener(() => update());
            }
        }

        buildOverrides();
    }

    function getRulesOrError(): [CSSRuleList | null, Error | null] {
        try {
            if (element.sheet == null) {
                return [null, null];
            }
            return [element.sheet.cssRules, null];
        } catch (err) {
            return [null, err];
        }
    }

    // NOTE: In Firefox, when link is loading,
    // `sheet` property is not null,
    // but `cssRules` access error is thrown
    function isStillLoadingError(error: Error) {
        return error && error.message && error.message.includes('loading');
    }

    // Seems like Firefox bug: silent exception is produced
    // without any notice, when accessing <style> CSS rules
    function safeGetSheetRules() {
        const [cssRules, err] = getRulesOrError();
        if (err) {
            logWarn(err);
            return null;
        }
        return cssRules;
    }

    function watchForSheetChanges() {
        watchForSheetChangesUsingProxy();
        // Sometimes sheet can be null in Firefox and Safari
        // So need to watch for it using rAF
        if (!(canOptimizeUsingProxy && element.sheet)) {
            watchForSheetChangesUsingRAF();
        }
    }

    let rulesChangeKey: number | null = null;
    let rulesCheckFrameId: number | null = null;

    function getRulesChangeKey() {
        const rules = safeGetSheetRules();
        return rules ? rules.length : null;
    }

    function didRulesKeyChange() {
        return getRulesChangeKey() !== rulesChangeKey;
    }

    function watchForSheetChangesUsingRAF() {
        rulesChangeKey = getRulesChangeKey();
        stopWatchingForSheetChangesUsingRAF();
        const checkForUpdate = () => {
            if (didRulesKeyChange()) {
                rulesChangeKey = getRulesChangeKey();
                update();
            }
            if (canOptimizeUsingProxy && element.sheet) {
                stopWatchingForSheetChangesUsingRAF();
                return;
            }
            rulesCheckFrameId = requestAnimationFrame(checkForUpdate);
        };

        checkForUpdate();
    }

    function stopWatchingForSheetChangesUsingRAF() {
        // TODO: reove cast once types are updated
        cancelAnimationFrame(rulesCheckFrameId as number);
    }

    let areSheetChangesPending = false;

    function onSheetChange() {
        canOptimizeUsingProxy = true;
        stopWatchingForSheetChangesUsingRAF();
        if (areSheetChangesPending) {
            return;
        }

        function handleSheetChanges() {
            areSheetChangesPending = false;
            if (cancelAsyncOperations) {
                return;
            }
            update();
        }

        areSheetChangesPending = true;
        if (typeof queueMicrotask === 'function') {
            queueMicrotask(handleSheetChanges);
        } else {
            requestAnimationFrame(handleSheetChanges);
        }
    }

    function watchForSheetChangesUsingProxy() {
        element.addEventListener('__darkreader__updateSheet', onSheetChange, {
            passive: true,
        });
    }

    function stopWatchingForSheetChangesUsingProxy() {
        element.removeEventListener('__darkreader__updateSheet', onSheetChange);
    }

    function stopWatchingForSheetChanges() {
        stopWatchingForSheetChangesUsingProxy();
        stopWatchingForSheetChangesUsingRAF();
    }

    function pause() {
        observer.disconnect();
        cancelAsyncOperations = true;
        corsCopyPositionWatcher && corsCopyPositionWatcher.stop();
        syncStylePositionWatcher && syncStylePositionWatcher.stop();
        stopWatchingForSheetChanges();
    }

    function destroy() {
        pause();
        removeNode(corsCopy);
        removeNode(syncStyle);
        loadingEnd();
        if (rejectorsForLoadingLinks.has(loadingLinkId)) {
            const reject = rejectorsForLoadingLinks.get(loadingLinkId);
            rejectorsForLoadingLinks.delete(loadingLinkId);
            reject && reject();
        }
    }

    function watch() {
        observer.observe(element, observerOptions);
        if (element instanceof HTMLStyleElement) {
            watchForSheetChanges();
        }
    }

    const maxMoveCount = 10;
    let moveCount = 0;

    function restore() {
        if (!syncStyle) {
            return;
        }

        moveCount++;
        if (moveCount > maxMoveCount) {
            logWarn('Style sheet was moved multiple times', element);
            return;
        }

        logWarn('Restore style', syncStyle, element);
        insertStyle();
        corsCopyPositionWatcher && corsCopyPositionWatcher.skip();
        syncStylePositionWatcher && syncStylePositionWatcher.skip();
        if (!isOverrideEmpty) {
            forceRenderStyle = true;
            update();
        }
    }

    return {
        details,
        render,
        pause,
        destroy,
        watch,
        restore,
    };
}

/**
 * 用于加载链接元素的样式
 * @param link 
 * @param loadingId 
 * @returns 
 */
async function linkLoading(link: HTMLLinkElement, loadingId: number) {
    return new Promise<void>((resolve, reject) => {
        const cleanUp = () => {
            link.removeEventListener('load', onLoad);
            link.removeEventListener('error', onError);
            rejectorsForLoadingLinks.delete(loadingId);
        };

        const onLoad = () => {
            cleanUp();
            logInfo(`Linkelement ${loadingId} has been loaded`);
            resolve();
        };

        const onError = () => {
            cleanUp();
            reject(`Linkelement ${loadingId} couldn't be loaded. ${link.href}`);
        };

        rejectorsForLoadingLinks.set(loadingId, () => {
            cleanUp();
            reject();
        });
        link.addEventListener('load', onLoad, { passive: true });
        link.addEventListener('error', onError, { passive: true });
        if (!link.href) {
            onError();
        }
    });
}

/**
 * 用于从 @import 语句中获取导入的样式表的 URL。
 * 它从给定的导入声明中提取 URL，并进行处理，去掉可能的空格和分号等。
 * @param importDeclaration 
 * @returns 
 */
function getCSSImportURL(importDeclaration: string) {
    // substring(7) is used to remove `@import` from the string.
    // And then use .trim() to remove the possible whitespaces.
    return getCSSURLValue(
        importDeclaration
            .substring(7)
            .trim()
            .replace(/;$/, '')
            .replace(/screen$/, ''),
    );
}

/**
 * 用于加载文本资源，包括样式表。它接受一个 URL 字符串，
 * 根据 URL 的类型（以 data: 开头或非 data: 开头）来决定如何加载。
 * 对于非 data: URL，它使用 bgFetch 函数来进行后台加载，返回一个包含加载文本的 Promise
 * @param url 
 * @returns 
 */
async function loadText(url: string) {
    if (url.startsWith('data:')) {
        return await (await fetch(url)).text();
    }
    return await bgFetch({
        url,
        responseType: 'text',
        mimeType: 'text/css',
        origin: window.location.origin,
    });
}

/**
 * 用于替换样式表中的 @import 语句
 * @param cssText 
 * @param basePath 
 * @param cache 
 * @returns 
 */
async function replaceCSSImports(
    cssText: string,
    basePath: string,
    cache = new Map<string, string>(),
) {
    cssText = removeCSSComments(cssText);
    cssText = replaceCSSFontFace(cssText);
    cssText = replaceCSSRelativeURLsWithAbsolute(cssText, basePath);

    const importMatches = getMatches(cssImportRegex, cssText);
    for (const match of importMatches) {
        const importURL = getCSSImportURL(match);
        const absoluteURL = getAbsoluteURL(basePath, importURL);
        let importedCSS: string;
        if (cache.has(absoluteURL)) {
            importedCSS = cache.get(absoluteURL)!;
        } else {
            try {
                importedCSS = await loadText(absoluteURL);
                cache.set(absoluteURL, importedCSS);
                importedCSS = await replaceCSSImports(
                    importedCSS,
                    getCSSBaseBath(absoluteURL),
                    cache,
                );
            } catch (err) {
                logWarn(err);
                importedCSS = '';
            }
        }
        cssText = cssText.split(match).join(importedCSS);
    }

    cssText = cssText.trim();

    return cssText;
}

/**
 * 用于创建样式表的 CORS 副本。
 * 它接受一个原始的样式元素和一个样式文本字符串，
 * 创建一个新的 style 元素并将样式文本插入其中。
 * 然后将新的样式元素插入到原始样式元素的后面，并返回新的样式元素。
 * 此函数用于处理一些跨域的样式表，因为有时候访问跨域样式表的 sheet 属性会抛出错误。
 * 通过创建 CORS 副本来绕过这个问题，从而可以访问样式表的 cssRules。
 * @param srcElement 
 * @param cssText 
 * @returns 
 */
function createCORSCopy(srcElement: StyleElement, cssText: string) {
    if (!cssText) {
        return null;
    }

    const cors = document.createElement('style');
    cors.classList.add('darkreader');
    cors.classList.add('darkreader--cors');
    cors.media = 'screen';
    cors.textContent = cssText;
    srcElement.parentNode!.insertBefore(cors, srcElement.nextSibling);
    cors.sheet!.disabled = true;
    corsStyleSet.add(cors);
    return cors;
}
