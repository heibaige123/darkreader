import { forEach, push } from '../../utils/array';
import type { ElementsTreeOperations } from '../utils/dom';
import { iterateShadowHosts, createOptimizedTreeObserver } from '../utils/dom';
import type { StyleElement } from './style-manager';
import { shouldManageStyle, getManageableStyles } from './style-manager';
import { ASSERT } from '../utils/log';

const observers: Array<{ disconnect(): void }> = [];
let observedRoots: WeakSet<Node>;

interface ChangedStyles {
    created: StyleElement[];
    updated: StyleElement[];
    removed: StyleElement[];
    moved: StyleElement[];
}

// Set of lower-case custom element names which were already defined
const definedCustomElements = new Set<string>();
const undefinedGroups = new Map<string, Set<Element>>();
let elementsDefinitionCallback: ((elements: Element[]) => void) | null;

/**
 * 判断一个元素是否为自定义元素。
 * @param element
 * @returns
 */
function isCustomElement(element: Element): boolean {
    if (element.tagName.includes('-') || element.getAttribute('is')) {
        return true;
    }
    return false;
}

/**
 * 记录尚未定义的自定义元素。
 * @param element
 * @returns
 */
function recordUndefinedElement(element: Element): void {
    let tag = element.tagName.toLowerCase();
    if (!tag.includes('-')) {
        const extendedTag = element.getAttribute('is');
        if (extendedTag) {
            tag = extendedTag;
        } else {
            // Happens for <template> on YouTube
            return;
        }
    }
    if (!undefinedGroups.has(tag)) {
        undefinedGroups.set(tag, new Set());
        customElementsWhenDefined(tag).then(() => {
            if (elementsDefinitionCallback) {
                const elements = undefinedGroups.get(tag);
                ASSERT(
                    'recordUndefinedElement() undefined groups should not be empty',
                    elements,
                );
                undefinedGroups.delete(tag);
                elementsDefinitionCallback(Array.from(elements!));
            }
        });
    }
    undefinedGroups.get(tag)!.add(element);
}

/**
 * 收集并记录未定义的自定义元素。
 * @param root
 * @returns
 */
function collectUndefinedElements(root: ParentNode): void {
    if (!true) {
        return;
    }
    forEach(root.querySelectorAll(':not(:defined)'), recordUndefinedElement);
}

let canOptimizeUsingProxy = false;
document.addEventListener(
    '__darkreader__inlineScriptsAllowed',
    () => {
        canOptimizeUsingProxy = true;
    },
    { once: true, passive: true },
);

const resolvers = new Map<string, Array<() => void>>();

/**
 * 当一个自定义元素被定义时，它会被触发
 * @param e
 */
function handleIsDefined(e: CustomEvent<{ tag: string }>) {
    canOptimizeUsingProxy = true;
    const tag = e.detail.tag;
    ASSERT(
        'handleIsDefined() expects lower-case node names',
        () => tag.toLowerCase() === tag,
    );
    definedCustomElements.add(tag);
    if (resolvers.has(tag)) {
        const r = resolvers.get(tag)!;
        resolvers.delete(tag);
        r.forEach((r) => r());
    }
}

/**
 * 等待一个自定义元素被定义。当指定的元素被定义后，返回的 Promise 将会被解决
 * @param tag
 * @returns
 */
async function customElementsWhenDefined(tag: string): Promise<void> {
    ASSERT(
        'customElementsWhenDefined() expects lower-case node names',
        () => tag.toLowerCase() === tag,
    );
    // Custom element is already defined
    if (definedCustomElements.has(tag)) {
        return;
    }
    // We need to await for element to be defined
    return new Promise<void>((resolve) => {
        // `customElements.whenDefined` is not available in extensions
        // https://bugs.chromium.org/p/chromium/issues/detail?id=390807
        if (
            window.customElements &&
            typeof customElements.whenDefined === 'function'
        ) {
            customElements.whenDefined(tag).then(() => resolve());
        } else if (canOptimizeUsingProxy) {
            if (resolvers.has(tag)) {
                resolvers.get(tag)!.push(resolve);
            } else {
                resolvers.set(tag, [resolve]);
            }
            document.dispatchEvent(
                new CustomEvent('__darkreader__addUndefinedResolver', {
                    detail: { tag },
                }),
            );
        } else {
            const checkIfDefined = () => {
                const elements = undefinedGroups.get(tag);
                if (elements && elements.size > 0) {
                    if (elements.values().next().value.matches(':defined')) {
                        resolve();
                    } else {
                        requestAnimationFrame(checkIfDefined);
                    }
                }
            };

            requestAnimationFrame(checkIfDefined);
        }
    });
}

/**
 * 当自定义元素被定义时，执行一个回调。
 * @param callback
 */
function watchWhenCustomElementsDefined(
    callback: (elements: Element[]) => void,
): void {
    elementsDefinitionCallback = callback;
}

/**
 * 取消订阅或停止监听与自定义元素定义相关的事件或回调
 */
function unsubscribeFromDefineCustomElements(): void {
    elementsDefinitionCallback = null;
    undefinedGroups.clear();
    document.removeEventListener('__darkreader__isDefined', handleIsDefined);
}

/**
 * 开始观察给定的样式元素列表的变化，当样式发生变化时，执行一个回调。
 * @param currentStyles
 * @param update
 * @param shadowRootDiscovered
 */
export function watchForStyleChanges(
    currentStyles: StyleElement[],
    update: (styles: ChangedStyles) => void,
    shadowRootDiscovered: (root: ShadowRoot) => void,
): void {
    stopWatchingForStyleChanges();

    const prevStyles = new Set<StyleElement>(currentStyles);
    const prevStyleSiblings = new WeakMap<Element, Element>();
    const nextStyleSiblings = new WeakMap<Element, Element>();

    /**
     * 用来记住元素在DOM或列表中的初始位置。
     * @param style
     */
    function saveStylePosition(style: StyleElement) {
        prevStyleSiblings.set(style, style.previousElementSibling!);
        nextStyleSiblings.set(style, style.nextElementSibling!);
    }

    /**
     * 从prevStyleSiblings和nextStyleSiblings映射中删除给定的StyleElement的保存位置。
     * @param style
     */
    function forgetStylePosition(style: StyleElement) {
        prevStyleSiblings.delete(style);
        nextStyleSiblings.delete(style);
    }

    /**
     * 检查StyleElement在DOM或列表中的当前位置是否与保存的位置发生了变化
     * @param style
     * @returns
     */
    function didStylePositionChange(style: StyleElement) {
        return (
            style.previousElementSibling !== prevStyleSiblings.get(style) ||
            style.nextElementSibling !== nextStyleSiblings.get(style)
        );
    }

    currentStyles.forEach(saveStylePosition);

    /**
     * 处理样式元素的创建、移动和删除。
     * @param operations
     */
    function handleStyleOperations(operations: {
        createdStyles: Set<StyleElement>;
        movedStyles: Set<StyleElement>;
        removedStyles: Set<StyleElement>;
    }) {
        const { createdStyles, removedStyles, movedStyles } = operations;

        createdStyles.forEach((s) => saveStylePosition(s));
        movedStyles.forEach((s) => saveStylePosition(s));
        removedStyles.forEach((s) => forgetStylePosition(s));

        createdStyles.forEach((s) => prevStyles.add(s));
        removedStyles.forEach((s) => prevStyles.delete(s));

        if (createdStyles.size + removedStyles.size + movedStyles.size > 0) {
            update({
                created: Array.from(createdStyles),
                removed: Array.from(removedStyles),
                moved: Array.from(movedStyles),
                updated: [],
            });
        }
    }

    /**
     * 处理DOM树的微小和大规模变化，以跟踪样式元素的变化。
     * @param param0
     */
    function handleMinorTreeMutations({
        additions,
        moves,
        deletions,
    }: ElementsTreeOperations) {
        const createdStyles = new Set<StyleElement>();
        const removedStyles = new Set<StyleElement>();
        const movedStyles = new Set<StyleElement>();

        additions.forEach((node) =>
            getManageableStyles(node).forEach((style) =>
                createdStyles.add(style),
            ),
        );
        deletions.forEach((node) =>
            getManageableStyles(node).forEach((style) =>
                removedStyles.add(style),
            ),
        );
        moves.forEach((node) =>
            getManageableStyles(node).forEach((style) =>
                movedStyles.add(style),
            ),
        );

        handleStyleOperations({ createdStyles, removedStyles, movedStyles });

        additions.forEach((n) => {
            extendedIterateShadowHosts(n);
            collectUndefinedElements(n);
        });

        // Firefox ocasionally fails to reflect existence of a node in both CSS's view of the DOM (':not(:defined)'),
        // and in DOM walker's view of the DOM. So instead we also check these mutations just in case.
        // In practice, at least one place reflects apperance of the node.
        // URL for testing: https://chromestatus.com/roadmap
        additions.forEach(
            (node) => isCustomElement(node) && recordUndefinedElement(node),
        );
    }

    /**
     * 处理DOM树的微小和大规模变化，以跟踪样式元素的变化。
     * @param root
     */
    function handleHugeTreeMutations(root: Document | ShadowRoot) {
        const styles = new Set(getManageableStyles(root));

        const createdStyles = new Set<StyleElement>();
        const removedStyles = new Set<StyleElement>();
        const movedStyles = new Set<StyleElement>();
        styles.forEach((s) => {
            if (!prevStyles.has(s)) {
                createdStyles.add(s);
            }
        });
        prevStyles.forEach((s) => {
            if (!styles.has(s)) {
                removedStyles.add(s);
            }
        });
        styles.forEach((s) => {
            if (
                !createdStyles.has(s) &&
                !removedStyles.has(s) &&
                didStylePositionChange(s)
            ) {
                movedStyles.add(s);
            }
        });

        handleStyleOperations({ createdStyles, removedStyles, movedStyles });

        extendedIterateShadowHosts(root);
        collectUndefinedElements(root);
    }

    /**
     * 处理属性变化，如rel、disabled、media和href，这些可能会影响样式元素的状态。
     * @param mutations
     */
    function handleAttributeMutations(mutations: MutationRecord[]) {
        const updatedStyles = new Set<StyleElement>();
        const removedStyles = new Set<StyleElement>();
        mutations.forEach((m) => {
            const { target } = m;
            if (target.isConnected) {
                if (shouldManageStyle(target)) {
                    updatedStyles.add(target as StyleElement);
                } else if (
                    target instanceof HTMLLinkElement &&
                    target.disabled
                ) {
                    removedStyles.add(target as StyleElement);
                }
            }
        });
        if (updatedStyles.size + removedStyles.size > 0) {
            update({
                updated: Array.from(updatedStyles),
                created: [],
                removed: Array.from(removedStyles),
                moved: [],
            });
        }
    }

    /**
     * 开始在给定的根上观察样式和属性变化。
     * @param root
     * @returns
     */
    function observe(root: Document | ShadowRoot) {
        if (observedRoots.has(root)) {
            return;
        }
        const treeObserver = createOptimizedTreeObserver(root, {
            onMinorMutations: handleMinorTreeMutations,
            onHugeMutations: handleHugeTreeMutations,
        });
        const attrObserver = new MutationObserver(handleAttributeMutations);
        attrObserver.observe(root, {
            attributeFilter: ['rel', 'disabled', 'media', 'href'],
            subtree: true,
        });
        observers.push(treeObserver, attrObserver);
        observedRoots.add(root);
    }

    /**
     * 监视一个元素的Shadow DOM（如果存在）的变化
     * @param node
     * @returns
     */
    function subscribeForShadowRootChanges(node: Element) {
        const { shadowRoot } = node;
        if (shadowRoot == null || observedRoots.has(shadowRoot)) {
            return;
        }
        observe(shadowRoot);
        shadowRootDiscovered(shadowRoot);
    }

    /**
     * 扩展迭代shadow host来观察它们的变化。
     * @param node
     */
    function extendedIterateShadowHosts(node: Node) {
        iterateShadowHosts(node, subscribeForShadowRootChanges);
    }

    observe(document);
    extendedIterateShadowHosts(document.documentElement);

    watchWhenCustomElementsDefined((hosts) => {
        const newStyles: StyleElement[] = [];
        hosts.forEach((host) =>
            push(newStyles, getManageableStyles(host.shadowRoot)),
        );
        update({ created: newStyles, updated: [], removed: [], moved: [] });
        hosts.forEach((host) => {
            const { shadowRoot } = host;
            if (shadowRoot == null) {
                return;
            }
            subscribeForShadowRootChanges(host);
            extendedIterateShadowHosts(shadowRoot);
            collectUndefinedElements(shadowRoot);
        });
    });
    document.addEventListener('__darkreader__isDefined', handleIsDefined, {
        passive: true,
    });
    collectUndefinedElements(document);
}

/**
 * 重置或清理与观察者相关的所有数据和监听
 */
function resetObservers() {
    observers.forEach((o) => o.disconnect());
    observers.splice(0, observers.length);
    observedRoots = new WeakSet();
}

/**
 * 停止所有的观察。
 */
export function stopWatchingForStyleChanges(): void {
    resetObservers();
    unsubscribeFromDefineCustomElements();
}
