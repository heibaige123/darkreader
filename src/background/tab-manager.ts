import { canInjectScript } from '../background/utils/extension-api';
import { createFileLoader } from './utils/network';
import type { FetchRequestParameters } from './utils/network';
import type {
    MessageBGtoCS,
    MessageCStoBG,
    MessageUItoBG,
    documentId,
    frameId,
    scriptId,
    tabId,
} from '../definitions';
import {
    MessageTypeCStoBG,
    MessageTypeBGtoCS,
    MessageTypeUItoBG,
} from '../utils/message';
import { ASSERT, logWarn } from './utils/log';
import { StateManager } from '../utils/state-manager';
import { getURLHostOrProtocol } from '../utils/url';
import { isPanel } from './utils/tab';
import { makeFirefoxHappy } from './make-firefox-happy';
import { getActiveTab, queryTabs } from '../utils/tabs';

interface TabManagerOptions {
    getConnectionMessage: (
        tabURl: string,
        url: string,
        isTopFrame: boolean,
    ) => Promise<MessageBGtoCS>;
    getTabMessage: (
        tabURL: string,
        url: string,
        isTopFrame: boolean,
    ) => MessageBGtoCS;
    onColorSchemeChange: (isDark: boolean) => void;
}

interface DocumentInfo {
    scriptId: scriptId;
    documentId: documentId | null;
    isTop: true | undefined;
    url: string | null;
    state: DocumentState;
    timestamp: number;
    darkThemeDetected: boolean;
}

interface TabManagerState extends Record<string, unknown> {
    tabs: { [tabId: tabId]: { [frameId: frameId]: DocumentInfo } };
    timestamp: number;
}

/**
 * These states correspond to possible document states in Page Lifecycle API:
 * https://developers.google.com/web/updates/2018/07/page-lifecycle-api#developer-recommendations-for-each-state
 * Some states are not currently used (they are declared for future-proofing).
 */
const enum DocumentState {
    ACTIVE = 0,
    PASSIVE = 1,
    HIDDEN = 2,
    FROZEN = 3,
    TERMINATED = 4,
    DISCARDED = 5,
}

/**
 * Note: On Chromium builds, we use documentId if it is available.
 * We avoid messaging using farmeId entirely since when document is prerendered, it gets a temporary frameId
 * and if we attempt to send to {frameId, documentId} with old frameId, then the message will be dropped.
 */
export default class TabManager {
    private static tabs: TabManagerState['tabs'];
    private static stateManager: StateManager<TabManagerState>;
    private static fileLoader: {
        get: (params: FetchRequestParameters) => Promise<string | null>;
    } | null = null;
    private static onColorSchemeChange: TabManagerOptions['onColorSchemeChange'];
    private static getTabMessage: TabManagerOptions['getTabMessage'];
    private static timestamp: TabManagerState['timestamp'];
    private static readonly LOCAL_STORAGE_KEY = 'TabManager-state';

    public static init({
        getConnectionMessage,
        onColorSchemeChange,
        getTabMessage,
    }: TabManagerOptions): void {
        TabManager.stateManager = new StateManager<TabManagerState>(
            TabManager.LOCAL_STORAGE_KEY,
            this,
            { tabs: {}, timestamp: 0 },
            logWarn,
        );
        TabManager.tabs = {};
        TabManager.onColorSchemeChange = onColorSchemeChange;
        TabManager.getTabMessage = getTabMessage;

        chrome.runtime.onMessage.addListener(
            async (
                message: MessageCStoBG | MessageUItoBG,
                sender,
                sendResponse,
            ) => {
                if (false && makeFirefoxHappy(message, sender, sendResponse)) {
                    return;
                }
                switch (message.type) {
                    case MessageTypeCStoBG.DOCUMENT_CONNECT: {
                        TabManager.onColorSchemeMessage(message, sender);
                        await TabManager.stateManager.loadState();
                        const reply = (
                            tabURL: string,
                            url: string,
                            isTopFrame: boolean,
                        ) => {
                            getConnectionMessage(tabURL, url, isTopFrame).then(
                                (response) => {
                                    if (!response) {
                                        return;
                                    }
                                    response.scriptId = message.scriptId!;
                                    TabManager.sendDocumentMessage(
                                        sender.tab!.id!,
                                        sender.documentId!,
                                        response,
                                        sender.frameId!,
                                    );
                                },
                            );
                        };

                        if (isPanel(sender)) {
                            // NOTE: Vivaldi and Opera can show a page in a side panel,
                            // but it is not possible to handle messaging correctly (no tab ID, frame ID).

                            sendResponse('unsupportedSender');
                            return;
                        }

                        const { frameId } = sender;
                        const isTopFrame: boolean = frameId === 0;
                        const url = sender.url!;
                        const tabId = sender.tab!.id!;
                        const scriptId = message.scriptId!;
                        // Chromium 106+ may prerender frames resulting in top-level frames with chrome.runtime.MessageSender.tab.url
                        // set to chrome://newtab/ and positive chrome.runtime.MessageSender.frameId
                        const tabURL = sender.tab!.url!;
                        const documentId: documentId | null = false
                            ? sender.documentId!
                            : sender.documentId || null;

                        TabManager.addFrame(
                            tabId,
                            frameId!,
                            documentId,
                            scriptId,
                            url,
                            isTopFrame,
                        );

                        reply(tabURL, url, isTopFrame);
                        TabManager.stateManager.saveState();
                        break;
                    }

                    case MessageTypeCStoBG.DOCUMENT_FORGET:
                        if (!sender.tab) {
                            logWarn('Unexpected message', message, sender);
                            break;
                        }
                        ASSERT('Has a scriptId', () =>
                            Boolean(message.scriptId),
                        );
                        TabManager.removeFrame(
                            sender.tab!.id!,
                            sender.frameId!,
                        );
                        break;

                    case MessageTypeCStoBG.DOCUMENT_FREEZE: {
                        await TabManager.stateManager.loadState();
                        const info =
                            TabManager.tabs[sender.tab!.id!][sender.frameId!];
                        info.state = DocumentState.FROZEN;
                        info.url = null;
                        TabManager.stateManager.saveState();
                        break;
                    }

                    case MessageTypeCStoBG.DOCUMENT_RESUME: {
                        TabManager.onColorSchemeMessage(message, sender);
                        await TabManager.stateManager.loadState();
                        const tabId = sender.tab!.id!;
                        const tabURL = sender.tab!.url!;
                        const frameId = sender.frameId!;
                        const url = sender.url!;
                        const documentId: documentId | null = false
                            ? sender.documentId!
                            : sender.documentId! || null;
                        const isTopFrame: boolean = frameId === 0;
                        if (
                            TabManager.tabs[tabId][frameId].timestamp <
                            TabManager.timestamp
                        ) {
                            const response = TabManager.getTabMessage(
                                tabURL,
                                url,
                                isTopFrame,
                            );
                            response.scriptId = message.scriptId!;
                            TabManager.sendDocumentMessage(
                                tabId,
                                documentId!,
                                response,
                                frameId!,
                            );
                        }
                        TabManager.tabs[sender.tab!.id!][sender.frameId!] = {
                            documentId,
                            scriptId: message.scriptId!,
                            url,
                            isTop: isTopFrame || undefined,
                            state: DocumentState.ACTIVE,
                            darkThemeDetected: false,
                            timestamp: TabManager.timestamp,
                        };
                        TabManager.stateManager.saveState();
                        break;
                    }

                    case MessageTypeCStoBG.DARK_THEME_DETECTED:
                        TabManager.tabs[sender.tab!.id!][
                            sender.frameId!
                        ].darkThemeDetected = true;
                        break;

                    case MessageTypeCStoBG.FETCH: {
                        // Using custom response due to Chrome and Firefox incompatibility
                        // Sometimes fetch error behaves like synchronous and sends `undefined`
                        const id = message.id;
                        // We do not need to use scriptId here since every request has a unique id already
                        const sendResponse = (
                            response: Partial<MessageBGtoCS>,
                        ) => {
                            TabManager.sendDocumentMessage(
                                sender.tab!.id!,
                                sender.documentId!,
                                {
                                    type: MessageTypeBGtoCS.FETCH_RESPONSE,
                                    id,
                                    ...response,
                                },
                                sender.frameId!,
                            );
                        };

                        try {
                            const { url, responseType, mimeType, origin } =
                                message.data;
                            if (!TabManager.fileLoader) {
                                TabManager.fileLoader = createFileLoader();
                            }
                            const response = await TabManager.fileLoader.get({
                                url,
                                responseType,
                                mimeType,
                                origin,
                            });
                            sendResponse({ data: response });
                        } catch (err) {
                            sendResponse({
                                error: err && err.message ? err.message : err,
                            });
                        }
                        break;
                    }

                    case MessageTypeUItoBG.COLOR_SCHEME_CHANGE:
                    // fallthrough
                    case MessageTypeCStoBG.COLOR_SCHEME_CHANGE:
                        TabManager.onColorSchemeMessage(
                            message as MessageCStoBG,
                            sender,
                        );
                        break;

                    default:
                        break;
                }
            },
        );

        chrome.tabs.onRemoved.addListener(async (tabId) =>
            TabManager.removeFrame(tabId, 0),
        );
    }

    private static sendDocumentMessage(
        tabId: tabId,
        documentId: documentId,
        message: MessageBGtoCS,
        frameId: frameId,
    ) {
        chrome.tabs.sendMessage<MessageBGtoCS>(tabId, message, { frameId });
    }

    private static onColorSchemeMessage(
        message: MessageCStoBG,
        sender: chrome.runtime.MessageSender,
    ) {
        ASSERT('TabManager.onColorSchemeMessage is set', () =>
            Boolean(TabManager.onColorSchemeChange),
        );

        // We honor only messages which come from tab's top frame
        // because sub-frames color scheme can be overridden by style with prefers-color-scheme
        // TODO(MV3): instead of dropping these messages, consider making a query to an authoritative source
        // like offscreen document
        if (sender && sender.frameId === 0) {
            TabManager.onColorSchemeChange(message.data.isDark);
        }
    }

    private static addFrame(
        tabId: tabId,
        frameId: frameId,
        documentId: documentId | null,
        scriptId: scriptId,
        url: string,
        isTop: boolean,
    ) {
        let frames: { [frameId: frameId]: DocumentInfo };
        if (TabManager.tabs[tabId]) {
            frames = TabManager.tabs[tabId];
        } else {
            frames = {};
            TabManager.tabs[tabId] = frames;
        }
        frames[frameId] = {
            documentId,
            scriptId,
            url,
            isTop: isTop || undefined,
            state: DocumentState.ACTIVE,
            darkThemeDetected: false,
            timestamp: TabManager.timestamp,
        };
    }

    private static async removeFrame(tabId: tabId, frameId: frameId) {
        await TabManager.stateManager.loadState();

        if (frameId === 0) {
            delete TabManager.tabs[tabId];
        }

        if (TabManager.tabs[tabId] && TabManager.tabs[tabId][frameId]) {
            // We need to use delete here because Object.entries()
            // in sendMessage() would enumerate undefined as well.
            delete TabManager.tabs[tabId][frameId];
        }

        TabManager.stateManager.saveState();
    }

    public static async getTabURL(
        tab: chrome.tabs.Tab | null,
    ): Promise<string> {
        // It can happen in cases whereby the tab.url is empty.
        // Luckily this only and will only happen on `about:blank`-like pages.
        // Due to this we can safely use `about:blank` as fallback value.
        // In some extraordinary circumstances tab may be undefined.
        return (tab && tab.url) || 'about:blank';
    }

    public static async updateContentScript(options: {
        runOnProtectedPages: boolean;
    }): Promise<void> {
        (await queryTabs({ discarded: false }))
            .filter(
                (tab) =>
                    options.runOnProtectedPages || canInjectScript(tab.url),
            )
            .filter((tab) => !Boolean(TabManager.tabs[tab.id!]))
            .forEach((tab) => {
                chrome.tabs.executeScript(tab.id!, {
                    runAt: 'document_start',
                    file: '/inject/index.js',
                    allFrames: true,
                    matchAboutBlank: true,
                });
            });
    }

    public static async registerMailDisplayScript(): Promise<void> {
        await (chrome as any).messageDisplayScripts.register({
            js: [{ file: '/inject/fallback.js' }, { file: '/inject/index.js' }],
        });
    }

    // sendMessage will send a tab messages to all active tabs and their frames.
    // If onlyUpdateActiveTab is specified, it will only send a new message to any
    // tab that matches the active tab's hostname. This is to ensure that when a user
    // has multiple tabs of the same website, every tab will receive the new message
    // and not just that tab as Dark Reader currently doesn't have per-tab operations,
    // this should be the expected behavior.
    public static async sendMessage(
        onlyUpdateActiveTab = false,
    ): Promise<void> {
        TabManager.timestamp++;

        const activeTabHostname = onlyUpdateActiveTab
            ? getURLHostOrProtocol(await TabManager.getActiveTabURL())
            : null;

        (await queryTabs({ discarded: false }))
            .filter((tab) => Boolean(TabManager.tabs[tab.id!]))
            .forEach((tab) => {
                const frames = TabManager.tabs[tab.id!];
                Object.entries(frames)
                    .filter(
                        ([, { state }]) =>
                            state === DocumentState.ACTIVE ||
                            state === DocumentState.PASSIVE,
                    )
                    .forEach(
                        async ([id, { url, documentId, scriptId, isTop }]) => {
                            const frameId = Number(id);
                            const tabURL = await TabManager.getTabURL(tab);

                            // Check if hostname are equal when we only want to update active tab.
                            if (
                                onlyUpdateActiveTab &&
                                getURLHostOrProtocol(tabURL) !==
                                    activeTabHostname
                            ) {
                                return;
                            }

                            const message = TabManager.getTabMessage(
                                tabURL,
                                url!,
                                !!isTop,
                            );
                            message.scriptId = scriptId;

                            if (tab.active && isTop) {
                                TabManager.sendDocumentMessage(
                                    tab!.id!,
                                    documentId!,
                                    message,
                                    frameId,
                                );
                            } else {
                                setTimeout(() => {
                                    TabManager.sendDocumentMessage(
                                        tab!.id!,
                                        documentId!,
                                        message,
                                        frameId,
                                    );
                                });
                            }
                            if (TabManager.tabs[tab.id!][frameId]) {
                                TabManager.tabs[tab.id!][frameId].timestamp =
                                    TabManager.timestamp;
                            }
                        },
                    );
            });
    }

    public static canAccessTab(tab: chrome.tabs.Tab | null): boolean {
        return !!(tab && Boolean(TabManager.tabs[tab.id!]));
    }

    public static getTabDocumentId(
        tab: chrome.tabs.Tab | null,
    ): documentId | null {
        return (
            tab &&
            TabManager.tabs[tab.id!] &&
            TabManager.tabs[tab.id!][0] &&
            TabManager.tabs[tab.id!][0].documentId
        );
    }

    public static isTabDarkThemeDetected(
        tab: chrome.tabs.Tab | null,
    ): boolean | null {
        return (
            (tab &&
                TabManager.tabs[tab.id!] &&
                TabManager.tabs[tab.id!][0] &&
                TabManager.tabs[tab.id!][0].darkThemeDetected) ||
            null
        );
    }

    public static async getActiveTabURL(): Promise<string> {
        return TabManager.getTabURL(await getActiveTab());
    }
}
