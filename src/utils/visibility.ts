/**
 * The following code contains a workaround for extensions designed to prevent page from knowing when it is hidden
 * GitHub issue: https://github.com/darkreader/darkreader/issues/10004
 * GitHub PR: https://github.com/darkreader/darkreader/pull/10047
 *
 * Doue to the intntional breakage introduced by these extensions, this utility might incorrecly report that document
 * is visible while it is not, but it will never report document as hidden while it is visible.
 *
 * This code exploits the fact that most such extensions block only a subset of Page Lifecycle API,
 * which notifies page of being hidden but not of being shown, while Dark Reader really cares only about
 * page being shown.
 * Specifically:
 *  - extensions block visibilitychange and blur event
 *  - extensions do not block focus event; browsers deliver focus event when user switches to
 *    a previously hidden tab or previously hidden window (assuming DevTools are closed so window gets the focus)
 *    if document has focus, then we can assume that it is visible
 *  - some extensions overwrite document.hidden but not document.visibilityState
 *  - Firefox has a bug: if extension overwrites document.hidden and document.visibilityState via Object.defineProperty,
 *    then Firefox will reset them to true and 'hidden' when tab is activated, but document.hasFocus() will be true
 *  - Safari supports document.visibilityState === 'prerender' which makes document.hidden === true even when document
 *    is visible to the user
 *
 * Note: This utility supports adding only one callback since currently calling code sets only one listener and Firefox
 * has issues optimizing code with multiple callbacks stored in array or in a set.
 */

/**
 * 一个全局的回调函数，它会在文档可见性发生变化时被调用
 */
let documentVisibilityListener: (() => void) | null = null;

/**
 * 表示文档当前是否可见
 */
let documentIsVisible_ = !document.hidden;

// TODO: use EventListenerOptions class once it is updated
const listenerOptions: any = {
    capture: true,
    passive: true,
};

/**
 * 添加三个事件监听器，监听文档的可见性变化
 */
function watchForDocumentVisibility(): void {
    document.addEventListener(
        'visibilitychange',
        documentVisibilityListener!,
        listenerOptions,
    );
    window.addEventListener(
        'pageshow',
        documentVisibilityListener!,
        listenerOptions,
    );
    window.addEventListener(
        'focus',
        documentVisibilityListener!,
        listenerOptions,
    );
}

/**
 * 移除文档的可见性监听
 */
function stopWatchingForDocumentVisibility(): void {
    document.removeEventListener(
        'visibilitychange',
        documentVisibilityListener!,
        listenerOptions,
    );
    window.removeEventListener(
        'pageshow',
        documentVisibilityListener!,
        listenerOptions,
    );
    window.removeEventListener(
        'focus',
        documentVisibilityListener!,
        listenerOptions,
    );
}

/**
 * 允许外部代码设置一个回调函数，当文档从不可见变为可见时，这个回调会被触发。
 * 如果之前没有设置过监听器，那么会开始监视文档的可见性。
 * @param callback 
 */
export function setDocumentVisibilityListener(callback: () => void): void {
    const alreadyWatching = Boolean(documentVisibilityListener);
    documentVisibilityListener = () => {
        if (!document.hidden) {
            removeDocumentVisibilityListener();
            callback();
            documentIsVisible_ = true;
        }
    };
    if (!alreadyWatching) {
        watchForDocumentVisibility();
    }
}

/**
 * 停止监视文档的可见性并移除回调函数。
 */
export function removeDocumentVisibilityListener(): void {
    stopWatchingForDocumentVisibility();
    documentVisibilityListener = null;
}

/**
 * 返回一个布尔值，表示文档是否当前可见。
 * @returns 
 */
export function documentIsVisible(): boolean {
    return documentIsVisible_;
}
