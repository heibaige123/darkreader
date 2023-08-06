import { Extension } from './extension';
import { getHelpURL, UNINSTALL_URL } from '../utils/links';
import { canInjectScript } from '../background/utils/extension-api';
import type {
    ColorScheme,
    DebugMessageBGtoCS,
    DebugMessageBGtoUI,
    DebugMessageCStoBG,
    ExtensionData,
    News,
    UserSettings,
} from '../definitions';
import {
    DebugMessageTypeBGtoCS,
    DebugMessageTypeBGtoUI,
    DebugMessageTypeCStoBG,
} from '../utils/message';
import { makeChromiumHappy } from './make-chromium-happy';
import { ASSERT, logInfo } from './utils/log';
import { sendLog } from './utils/sendLog';
import { isFirefox } from '../utils/platform';
import {
    emulateColorScheme,
    isSystemDarkModeEnabled,
} from '../utils/media-query';
import { setNewsForTesting } from './newsmaker';

type TestMessage =
    | {
          type: 'getManifest';
          id: number;
      }
    | {
          type: 'changeSettings';
          data: Partial<UserSettings>;
          id: number;
      }
    | {
          type: 'collectData';
          id: number;
      }
    | {
          type: 'getChromeStorage';
          data: {
              region: 'local' | 'sync';
              keys: string | string[];
          };
          id: number;
      }
    | {
          type: 'changeChromeStorage';
          data: {
              region: 'local' | 'sync';
              data: { [key: string]: any };
          };
          id: number;
      }
    | {
          type: 'firefox-createTab';
          data: string;
          id: number;
      }
    | {
          type: 'firefox-getColorScheme';
          id: number;
      }
    | {
          type: 'firefox-emulateColorScheme';
          data: ColorScheme;
          id: number;
      }
    | {
          type: 'setNews';
          data: News[];
          id: number;
      };

// Start extension
const extension = Extension.start();

const welcome = `  /''''\\
 (0)==(0)
/__||||__\\
Welcome to Dark Reader!`;
console.log(welcome);

declare const __WATCH__: boolean;
declare const __PORT__: number;

if (__WATCH__) {
    const PORT = __PORT__;
    const ALARM_NAME = 'socket-close';
    const PING_INTERVAL_IN_MINUTES = 1 / 60;

    const socketAlarmListener = (alarm: chrome.alarms.Alarm) => {
        if (alarm.name === ALARM_NAME) {
            listen();
        }
    };

    const listen = () => {
        const socket = new WebSocket(`ws://localhost:${PORT}`);
        const send = (message: { type: string }) =>
            socket.send(JSON.stringify(message));
        socket.onmessage = (e) => {
            chrome.alarms.onAlarm.removeListener(socketAlarmListener);

            const message = JSON.parse(e.data);
            if (message.type.startsWith('reload:')) {
                send({ type: 'reloading' });
            }
            switch (message.type) {
                case 'reload:css':
                    chrome.runtime.sendMessage<DebugMessageBGtoUI>({
                        type: DebugMessageTypeBGtoUI.CSS_UPDATE,
                    });
                    break;
                case 'reload:ui':
                    chrome.runtime.sendMessage<DebugMessageBGtoUI>({
                        type: DebugMessageTypeBGtoUI.UPDATE,
                    });
                    break;
                case 'reload:full':
                    chrome.tabs.query({}, (tabs) => {
                        const message: DebugMessageBGtoCS = {
                            type: DebugMessageTypeBGtoCS.RELOAD,
                        };
                        // Some contexts are not considered to be tabs and can not receive regular messages
                        chrome.runtime.sendMessage<DebugMessageBGtoCS>(message);
                        for (const tab of tabs) {
                            if (canInjectScript(tab.url)) {
                                chrome.tabs.sendMessage<DebugMessageBGtoCS>(
                                    tab.id!,
                                    message,
                                );
                            }
                        }
                        chrome.runtime.reload();
                    });
                    break;
            }
        };
        socket.onclose = () => {
            chrome.alarms.onAlarm.addListener(socketAlarmListener);
            chrome.alarms.create(ALARM_NAME, {
                delayInMinutes: PING_INTERVAL_IN_MINUTES,
            });
        };
    };

    listen();
} else if (true) {
    chrome.runtime.onInstalled.addListener(({ reason }) => {
        if (reason === 'install') {
            chrome.tabs.create({ url: getHelpURL() });
        }
    });

    chrome.runtime.setUninstallURL(UNINSTALL_URL);
}

makeChromiumHappy();
