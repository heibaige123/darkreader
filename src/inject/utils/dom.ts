import { logWarn } from '../utils/log';
import { throttle } from '../../utils/throttle';
import { forEach } from '../../utils/array';
import { getDuration } from '../../utils/time';

/**
 * 用于传递创建DOM节点所需的参数。它包含了一些用于选择目标节点、创建节点和更新节点的函数
 */
interface CreateNodeAsapParams {
    selectNode: () => HTMLElement;
    createNode: (target: HTMLElement) => void;
    updateNode: (existing: HTMLElement) => void;
    selectTarget: () => HTMLElement;
    createTarget: () => HTMLElement;
    isTargetMutation: (mutation: MutationRecord) => boolean;
}

/**
 * 用于定义观察DOM节点位置的方法。它包含了三个方法：run、stop和skip，分别用于启动、停止和跳过观察器的运行
 */
interface NodePosetionWatcher {
    run: () => void;
    stop: () => void;
    skip: () => void;
}

/**
 * 用于在尽可能快的时间内创建DOM节点。它根据传入的参数选择目标节点，并根据目标节点的状态执行相应的操作（创建节点或更新节点）
 * @param param0
 */
export function createNodeAsap({
    selectNode,
    createNode,
    updateNode,
    selectTarget,
    createTarget,
    isTargetMutation,
}: CreateNodeAsapParams): void {
    const target = selectTarget();
    if (target) {
        const prev = selectNode();
        if (prev) {
            updateNode(prev);
        } else {
            createNode(target);
        }
    } else {
        const observer = new MutationObserver((mutations) => {
            const mutation = mutations.find(isTargetMutation);
            if (mutation) {
                unsubscribe();
                const target = selectTarget();
                selectNode() || createNode(target);
            }
        });

        const ready = () => {
            if (document.readyState !== 'complete') {
                return;
            }

            unsubscribe();
            const target = selectTarget() || createTarget();
            selectNode() || createNode(target);
        };

        const unsubscribe = () => {
            document.removeEventListener('readystatechange', ready);
            observer.disconnect();
        };

        if (document.readyState === 'complete') {
            ready();
        } else {
            // readystatechange event is not cancellable and does not bubble
            document.addEventListener('readystatechange', ready);
            observer.observe(document, { childList: true, subtree: true });
        }
    }
}

/**
 * 用于从DOM中移除给定的节点
 * @param node
 */
export function removeNode(node: Node | null): void {
    node && node.parentNode && node.parentNode.removeChild(node);
}

/**
 * 用于观察DOM节点的位置变化。它接收一个节点和一个模式（"head"或"prev-sibling"），并在节点的位置发生变化时执行相应的回调函数。
 * @param node
 * @param mode
 * @param onRestore
 * @returns
 */
export function watchForNodePosition<T extends Node>(
    node: T,
    mode: 'head' | 'prev-sibling',
    onRestore = Function.prototype,
): NodePosetionWatcher {
    const MAX_ATTEMPTS_COUNT = 10;
    const RETRY_TIMEOUT = getDuration({ seconds: 2 });
    const ATTEMPTS_INTERVAL = getDuration({ seconds: 10 });
    const prevSibling = node.previousSibling;
    let parent = node.parentNode;
    if (!parent) {
        throw new Error(
            'Unable to watch for node position: parent element not found',
        );
    }
    if (mode === 'prev-sibling' && !prevSibling) {
        throw new Error(
            'Unable to watch for node position: there is no previous sibling',
        );
    }
    let attempts = 0;
    let start: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    /**
     * 节流函数，用于处理恢复过程。
     */
    const restore = throttle(() => {
        if (timeoutId) {
            return;
        }
        attempts++;
        const now = Date.now();
        if (start == null) {
            start = now;
        } else if (attempts >= MAX_ATTEMPTS_COUNT) {
            if (now - start < ATTEMPTS_INTERVAL) {
                logWarn(
                    `Node position watcher paused: retry in ${RETRY_TIMEOUT}ms`,
                    node,
                    prevSibling,
                );
                timeoutId = setTimeout(() => {
                    start = null;
                    attempts = 0;
                    timeoutId = null;
                    restore();
                }, RETRY_TIMEOUT);
                return;
            }
            start = now;
            attempts = 1;
        }

        if (mode === 'head') {
            if (prevSibling && prevSibling.parentNode !== parent) {
                logWarn(
                    'Unable to restore node position: sibling parent changed',
                    node,
                    prevSibling,
                    parent,
                );
                stop();
                return;
            }
        }

        if (mode === 'prev-sibling') {
            if (prevSibling!.parentNode == null) {
                logWarn(
                    'Unable to restore node position: sibling was removed',
                    node,
                    prevSibling,
                    parent,
                );
                stop();
                return;
            }
            if (prevSibling!.parentNode !== parent) {
                logWarn(
                    'Style was moved to another parent',
                    node,
                    prevSibling,
                    parent,
                );
                updateParent(prevSibling!.parentNode);
            }
        }

        // If parent becomes disconnected from the DOM, fetches the new head and
        // save that as parent. Do this only for the head mode, as those are
        // important nodes to keep.
        if (mode === 'head' && !parent!.isConnected) {
            parent = document.head;
            // TODO: Set correct prevSibling, which needs to be the last `.darkreader` in <head> that isn't .darkeader--sync or .darkreader--cors.
        }

        logWarn('Restoring node position', node, prevSibling, parent);
        parent!.insertBefore(
            node,
            prevSibling && prevSibling.isConnected
                ? prevSibling.nextSibling
                : parent!.firstChild,
        );
        observer.takeRecords();
        onRestore && onRestore();
    });
    /**
     * 用于监视 DOM 中的变化。
     */
    const observer = new MutationObserver(() => {
        if (
            (mode === 'head' &&
                (node.parentNode !== parent ||
                    !node.parentNode!.isConnected)) ||
            (mode === 'prev-sibling' && node.previousSibling !== prevSibling)
        ) {
            restore();
        }
    });
    /**
     * 启动 MutationObserver 并开始监视节点位置。
     */
    const run = () => {
        // TODO: remove type cast after dependency update
        observer.observe(parent!, { childList: true });
    };
    /**
     * 停止 MutationObserver 并取消恢复过程。
     */
    const stop = () => {
        // TODO: remove type cast after dependency update
        clearTimeout(timeoutId!);
        observer.disconnect();
        restore.cancel();
    };

    /**
     * 清除 MutationObserver 的记录。
     */
    const skip = () => {
        observer.takeRecords();
    };

    /**
     * 更新父元素为新值，并使用新的父元素重新启动 MutationObserver。
     * @param parentNode
     */
    const updateParent = (parentNode: (Node & ParentNode) | null) => {
        parent = parentNode;
        stop();
        run();
    };

    run();
    return { run, stop, skip };
}

/**
 * 用于遍历DOM树中的所有Shadow Host节点，并执行指定的回调函数。
 * @param root
 * @param iterator
 * @returns
 */
export function iterateShadowHosts(
    root: Node | null,
    iterator: (host: Element) => void,
): void {
    if (root == null) {
        return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
            return (node as Element).shadowRoot == null
                ? NodeFilter.FILTER_SKIP
                : NodeFilter.FILTER_ACCEPT;
        },
    });
    for (
        let node = (
            (root as Element).shadowRoot
                ? walker.currentNode
                : walker.nextNode()
        ) as Element;
        node != null;
        node = walker.nextNode() as Element
    ) {
        if (node.classList.contains('surfingkeys_hints_host')) {
            continue;
        }

        iterator(node);
        iterateShadowHosts(node.shadowRoot, iterator);
    }
}

/**
 * 指示DOM是否已完全加载
 * @returns
 */
export let isDOMReady: () => boolean = () => {
    return (
        document.readyState === 'complete' ||
        document.readyState === 'interactive'
    );
};

/**
 * 设置自定义的DOM就绪检查函数。
 * @param newFunc
 */
export function setIsDOMReady(newFunc: () => boolean): void {
    isDOMReady = newFunc;
}

const readyStateListeners = new Set<() => void>();

/**
 * 用于添加DOM就绪监听器的函数
 * @param listener
 */
export function addDOMReadyListener(listener: () => void): void {
    isDOMReady() ? listener() : readyStateListeners.add(listener);
}

/**
 * 用于移除DOM就绪监听器的函数
 * @param listener
 */
export function removeDOMReadyListener(listener: () => void): void {
    readyStateListeners.delete(listener);
}

// `interactive` can and will be fired when their are still stylesheets loading.
// We use certain actions that can cause a forced layout change, which is bad.
/**
 * 用于检查文档的readyState是否为"complete"的函数。
 * @returns
 */
export function isReadyStateComplete(): boolean {
    return document.readyState === 'complete';
}

const readyStateCompleteListeners = new Set<() => void>();

/**
 * 用于添加文档就绪完成监听器
 * @param listener
 */
export function addReadyStateCompleteListener(listener: () => void): void {
    isReadyStateComplete()
        ? listener()
        : readyStateCompleteListeners.add(listener);
}
/**
 * 清楚文档就绪监听器
 */
export function cleanReadyStateCompleteListeners(): void {
    readyStateCompleteListeners.clear();
}

if (!isDOMReady()) {
    /**
     * 当DOM的状态变为ready或complete时，这个函数会被调用。如果DOM已准备好，它会调用所有的readyStateListeners。
     * 如果状态是complete，它还会移除onReadyStateChange的事件监听器并调用所有的
     */
    const onReadyStateChange = () => {
        if (isDOMReady()) {
            readyStateListeners.forEach((listener) => listener());
            readyStateListeners.clear();
            if (isReadyStateComplete()) {
                document.removeEventListener(
                    'readystatechange',
                    onReadyStateChange,
                );
                readyStateCompleteListeners.forEach((listener) => listener());
                readyStateCompleteListeners.clear();
            }
        }
    };

    // readystatechange event is not cancellable and does not bubble
    document.addEventListener('readystatechange', onReadyStateChange);
}

/**
 * 定义了一个大的变异数量，用于后续判断。
 */
const HUGE_MUTATIONS_COUNT = 1000;

/**
 * 根据提供的变异记录判断是否有大量的变异。
 * @param mutations
 * @returns
 */
function isHugeMutation(mutations: MutationRecord[]) {
    if (mutations.length > HUGE_MUTATIONS_COUNT) {
        return true;
    }

    let addedNodesCount = 0;
    for (let i = 0; i < mutations.length; i++) {
        addedNodesCount += mutations[i].addedNodes.length;
        if (addedNodesCount > HUGE_MUTATIONS_COUNT) {
            return true;
        }
    }

    return false;
}

/**
 * 描述了三种元素树的操作：添加、移动和删除。
 */
export interface ElementsTreeOperations {
    additions: Set<Element>;
    moves: Set<Element>;
    deletions: Set<Element>;
}

/**
 * 根据提供的变异记录返回元素树的操作。它处理添加的节点、删除的节点以及移动的节点，并确保不会有重复的添加和删除操作。
 * @param mutations
 * @returns
 */
function getElementsTreeOperations(
    mutations: MutationRecord[],
): ElementsTreeOperations {
    const additions = new Set<Element>();
    const deletions = new Set<Element>();
    const moves = new Set<Element>();
    mutations.forEach((m) => {
        forEach(m.addedNodes, (n) => {
            if (n instanceof Element && n.isConnected) {
                additions.add(n);
            }
        });
        forEach(m.removedNodes, (n) => {
            if (n instanceof Element) {
                if (n.isConnected) {
                    moves.add(n);
                    additions.delete(n);
                } else {
                    deletions.add(n);
                }
            }
        });
    });

    const duplicateAdditions: Element[] = [];
    const duplicateDeletions: Element[] = [];
    additions.forEach((node) => {
        if (additions.has(node.parentElement as HTMLElement)) {
            duplicateAdditions.push(node);
        }
    });
    deletions.forEach((node) => {
        if (deletions.has(node.parentElement as HTMLElement)) {
            duplicateDeletions.push(node);
        }
    });
    duplicateAdditions.forEach((node) => additions.delete(node));
    duplicateDeletions.forEach((node) => deletions.delete(node));

    return { additions, moves, deletions };
}

/**
 * 定义了两个回调函数，一个用于处理小量的DOM变异，另一个用于处理大量的DOM变异。
 */
interface OptimizedTreeObserverCallbacks {
    onMinorMutations: (operations: ElementsTreeOperations) => void;
    onHugeMutations: (root: Document | ShadowRoot) => void;
}

/**
 * 用于存储和管理优化的DOM树观察器和它们的回调函数
 */
const optimizedTreeObservers = new Map<Node, MutationObserver>();
/**
 * 用于存储和管理优化的DOM树观察器和它们的回调函数
 */
const optimizedTreeCallbacks = new WeakMap<
    MutationObserver,
    Set<OptimizedTreeObserverCallbacks>
>();

// TODO: Use a single function to observe all shadow roots.
/**
 * 用于创建优化的DOM树观察器
 * @param root
 * @param callbacks
 * @returns
 */
export function createOptimizedTreeObserver(
    root: Document | ShadowRoot,
    callbacks: OptimizedTreeObserverCallbacks,
): { disconnect: () => void } {
    let observer: MutationObserver;
    let observerCallbacks: Set<OptimizedTreeObserverCallbacks>;
    let domReadyListener: () => void;

    if (optimizedTreeObservers.has(root)) {
        observer = optimizedTreeObservers.get(root)!;
        observerCallbacks = optimizedTreeCallbacks.get(observer)!;
    } else {
        let hadHugeMutationsBefore = false;
        let subscribedForReadyState = false;

        observer = new MutationObserver((mutations: MutationRecord[]) => {
            if (isHugeMutation(mutations)) {
                if (!hadHugeMutationsBefore || isDOMReady()) {
                    observerCallbacks.forEach(({ onHugeMutations }) =>
                        onHugeMutations(root),
                    );
                } else if (!subscribedForReadyState) {
                    domReadyListener = () =>
                        observerCallbacks.forEach(({ onHugeMutations }) =>
                            onHugeMutations(root),
                        );
                    addDOMReadyListener(domReadyListener);
                    subscribedForReadyState = true;
                }
                hadHugeMutationsBefore = true;
            } else {
                const elementsOperations = getElementsTreeOperations(mutations);
                observerCallbacks.forEach(({ onMinorMutations }) =>
                    onMinorMutations(elementsOperations),
                );
            }
        });
        observer.observe(root, { childList: true, subtree: true });
        optimizedTreeObservers.set(root, observer);
        observerCallbacks = new Set();
        optimizedTreeCallbacks.set(observer, observerCallbacks);
    }

    observerCallbacks.add(callbacks);

    return {
        disconnect() {
            observerCallbacks.delete(callbacks);
            if (domReadyListener) {
                removeDOMReadyListener(domReadyListener);
            }
            if (observerCallbacks.size === 0) {
                observer.disconnect();
                optimizedTreeCallbacks.delete(observer);
                optimizedTreeObservers.delete(root);
            }
        },
    };
}
