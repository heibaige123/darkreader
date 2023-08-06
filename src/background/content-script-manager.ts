import { logWarn } from './utils/log';

const enum ContentScriptManagerState {
    UNKNOWN,
    REGISTERING,
    REGISTERED,
    NOTREGISTERED,
}

export default class ContentScriptManager {
    /**
     * TODO: migrate to using promisses directly instead of wrapping callbacks.
     * Docs say that Promisses are not suported yet, but in practice they appear
     * to be supported already...
     */

    public static state: ContentScriptManagerState;

    public static async registerScripts(
        updateContentScripts: () => Promise<void>,
    ): Promise<void> {
        logWarn('ContentScriptManager is useful only within MV3 builds.');
        return;
    }

    public static async unregisterScripts(): Promise<void> {
        logWarn('ContentScriptManager is useful only within MV3 builds.');
        return;
    }
}
