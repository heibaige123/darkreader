import { createOrUpdateStyle, removeStyle } from './style';
import { createOrUpdateSVGFilter, removeSVGFilter } from './svg-filter';
import { runDarkThemeDetector, stopDarkThemeDetector } from './detector';
import {
    createOrUpdateDynamicTheme,
    removeDynamicTheme,
    cleanDynamicThemeCache,
} from './dynamic-theme';
import { logInfoCollapsed } from './utils/log';
import {
    isSystemDarkModeEnabled,
    runColorSchemeChangeDetector,
    stopColorSchemeChangeDetector,
} from '../utils/media-query';
import { collectCSS } from './dynamic-theme/css-collection';
import type {
    DebugMessageBGtoCS,
    MessageBGtoCS,
    MessageCStoBG,
    MessageCStoUI,
    MessageUItoCS,
} from '../definitions';
import {
    MessageTypeBGtoCS,
    MessageTypeCStoBG,
    MessageTypeCStoUI,
    MessageTypeUItoCS,
} from '../utils/message';
import { generateUID } from '../utils/uid';

let unloaded = false;

// Identifier for this particular script instance. It is used as an alternative to chrome.runtime.MessageSender.documentId
const scriptId = generateUID();

function cleanup() {
    unloaded = true;
    removeEventListener('pagehide', onPageHide);
    removeEventListener('freeze', onFreeze);
    removeEventListener('resume', onResume);
    cleanDynamicThemeCache();
    stopDarkThemeDetector();
    stopColorSchemeChangeDetector();
}

function sendMessage(message: MessageCStoBG | MessageCStoUI) {
    if (unloaded) {
        return;
    }
    const responseHandler = (
        response: MessageBGtoCS | 'unsupportedSender' | undefined,
    ) => {
        // Vivaldi bug workaround. See TabManager for details.
        if (response === 'unsupportedSender') {
            removeStyle();
            removeSVGFilter();
            removeDynamicTheme();
            cleanup();
        }
    };

    try {
        chrome.runtime.sendMessage<
            MessageCStoBG | MessageCStoUI,
            'unsupportedSender' | undefined
        >(message, responseHandler);
    } catch (error) {
        /*
         * We get here if Background context is unreachable which occurs when:
         *  - extension was disabled
         *  - extension was uninstalled
         *  - extension was updated and this is the old instance of content script
         *
         * Any async operations can be ignored here, but sync ones should run to completion.
         *
         * Regular message passing errors are returned via rejected promise or runtime.lastError.
         */
        if (error.message === 'Extension context invalidated.') {
            console.log(
                'Dark Reader: instance of old CS detected, clening up.',
            );
            cleanup();
        } else {
            console.log(
                'Dark Reader: unexpected error during message passing.',
            );
        }
    }
}

function onMessage(
    message: MessageBGtoCS | MessageUItoCS | DebugMessageBGtoCS,
) {
    if (
        (message as MessageBGtoCS).scriptId !== scriptId &&
        message.type !== MessageTypeUItoCS.EXPORT_CSS
    ) {
        return;
    }

    logInfoCollapsed(`onMessage[${message.type}]`, message);
    switch (message.type) {
        case MessageTypeBGtoCS.ADD_CSS_FILTER:
        case MessageTypeBGtoCS.ADD_STATIC_THEME: {
            const { css, detectDarkTheme } = message.data;
            removeDynamicTheme();
            createOrUpdateStyle(
                css,
                message.type === MessageTypeBGtoCS.ADD_STATIC_THEME
                    ? 'static'
                    : 'filter',
            );
            if (detectDarkTheme) {
                runDarkThemeDetector((hasDarkTheme) => {
                    if (hasDarkTheme) {
                        removeStyle();
                        onDarkThemeDetected();
                    }
                });
            }
            break;
        }
        case MessageTypeBGtoCS.ADD_SVG_FILTER: {
            const { css, svgMatrix, svgReverseMatrix, detectDarkTheme } =
                message.data;
            removeDynamicTheme();
            createOrUpdateSVGFilter(svgMatrix, svgReverseMatrix);
            createOrUpdateStyle(css, 'filter');
            if (detectDarkTheme) {
                runDarkThemeDetector((hasDarkTheme) => {
                    if (hasDarkTheme) {
                        removeStyle();
                        removeSVGFilter();
                        onDarkThemeDetected();
                    }
                });
            }
            break;
        }
        case MessageTypeBGtoCS.ADD_DYNAMIC_THEME: {
            const { theme, fixes, isIFrame, detectDarkTheme } = message.data;
            removeStyle();
            createOrUpdateDynamicTheme(theme, fixes, isIFrame);
            if (detectDarkTheme) {
                runDarkThemeDetector((hasDarkTheme) => {
                    if (hasDarkTheme) {
                        removeDynamicTheme();
                        onDarkThemeDetected();
                    }
                });
            }
            break;
        }
        case MessageTypeUItoCS.EXPORT_CSS:
            collectCSS().then((collectedCSS) =>
                sendMessage({
                    type: MessageTypeCStoUI.EXPORT_CSS_RESPONSE,
                    data: collectedCSS,
                }),
            );
            break;
        case MessageTypeBGtoCS.UNSUPPORTED_SENDER:
        case MessageTypeBGtoCS.CLEAN_UP:
            removeStyle();
            removeSVGFilter();
            removeDynamicTheme();
            stopDarkThemeDetector();
            break;
        default:
            break;
    }
}

function sendConnectionOrResumeMessage(
    type:
        | MessageTypeCStoBG.DOCUMENT_CONNECT
        | MessageTypeCStoBG.DOCUMENT_RESUME,
) {
    sendMessage({
        type,
        scriptId,
        data: {
            isDark: isSystemDarkModeEnabled(),
        },
    });
}

runColorSchemeChangeDetector((isDark) =>
    sendMessage({
        type: MessageTypeCStoBG.COLOR_SCHEME_CHANGE,
        data: { isDark },
    }),
);

chrome.runtime.onMessage.addListener(onMessage);
sendConnectionOrResumeMessage(MessageTypeCStoBG.DOCUMENT_CONNECT);

function onPageHide(e: PageTransitionEvent) {
    if (e.persisted === false) {
        sendMessage({ type: MessageTypeCStoBG.DOCUMENT_FORGET, scriptId });
    }
}

function onFreeze() {
    sendMessage({ type: MessageTypeCStoBG.DOCUMENT_FREEZE });
}

function onResume() {
    sendConnectionOrResumeMessage(MessageTypeCStoBG.DOCUMENT_RESUME);
}

function onDarkThemeDetected() {
    sendMessage({ type: MessageTypeCStoBG.DARK_THEME_DETECTED });
}

// Thunderbird does not have "tabs", and emails aren't 'frozen' or 'cached'.
// And will currently error: `Promise rejected after context unloaded: Actor 'Conduits' destroyed before query 'RuntimeMessage' was resolved`
addEventListener('pagehide', onPageHide, { passive: true });
addEventListener('freeze', onFreeze, { passive: true });
addEventListener('resume', onResume, { passive: true });
