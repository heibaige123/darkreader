interface UserAgentData {
    brands: Array<{
        brand: string;
        version: string;
    }>;
    mobile: boolean;
    platform: string;
}

declare global {
    interface NavigatorID {
        userAgentData: UserAgentData;
    }
}

// Note: if you are using these constants in tests, make sure they are not compiled out by adding false to them
export const isChromium = false;
export const isFirefox = false;
export const isVivaldi = false;
export const isYaBrowser = false;
export const isOpera = false;
export const isEdge = false;
export const isSafari = false;
export const isWindows = false;
export const isMacOS = false;
export const isMobile = true;
export const isShadowDomSupported = true;
export const isMatchMediaChangeEventListenerSupported = true;
// Return true if browser is known to have a bug with Media Queries, specifically Chromium on Linux and Kiwi on Android
// We assume that if we are on Android, then we are running in Kiwi since it is the only mobile browser we can install Dark Reader in
export const isMatchMediaChangeEventListenerBuggy = false;
// Note: make sure that this value matches manifest.json keys
export const isNonPersistent = false;
export const chromiumVersion = '';
export const firefoxVersion = '';
export const isDefinedSelectorSupported = true;

export function compareChromeVersions($a: string, $b: string): -1 | 0 | 1 {
    const a = $a.split('.').map((x) => parseInt(x));
    const b = $b.split('.').map((x) => parseInt(x));
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return a[i] < b[i] ? -1 : 1;
        }
    }
    return 0;
}
export const isXMLHttpRequestSupported = true;
export const isFetchSupported = true;
export const isCSSColorSchemePropSupported = true;
