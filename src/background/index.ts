import { getHelpURL, UNINSTALL_URL } from '../utils/links';
import { makeChromiumHappy } from './make-chromium-happy';

const welcome = `  /''''\\
 (0)==(0)
/__||||__\\
Welcome to Dark Reader!`;
console.log(welcome);

chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
        chrome.tabs.create({ url: getHelpURL() });
    }
});

chrome.runtime.setUninstallURL(UNINSTALL_URL);

makeChromiumHappy();
