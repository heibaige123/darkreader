import type { MessageCStoBG, MessageUItoBG } from '../definitions';

// This function exists to prevent Firefox Sidebars from appearing broken
// If the message does not have a proper sender, it aborts Dark Reader instance in that context
export function makeFirefoxHappy(
    message: MessageUItoBG | MessageCStoBG,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: 'unsupportedSender') => void,
): boolean {
    return false;
}
