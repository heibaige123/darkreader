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

const isNavigatorDefined = typeof navigator !== 'undefined';
const userAgent = isNavigatorDefined
    ? navigator.userAgentData && Array.isArray(navigator.userAgentData.brands)
        ? navigator.userAgentData.brands
              .map((brand) => `${brand.brand.toLowerCase()} ${brand.version}`)
              .join(' ')
        : navigator.userAgent.toLowerCase()
    : 'some useragent';

const platform = isNavigatorDefined
    ? navigator.userAgentData &&
      typeof navigator.userAgentData.platform === 'string'
        ? navigator.userAgentData.platform.toLowerCase()
        : navigator.platform.toLowerCase()
    : 'some platform';

// Note: if you are using these constants in tests, make sure they are not compiled out by adding false to them
export const isChromium =
    userAgent.includes('chrome') || userAgent.includes('chromium');
export const isFirefox = false;
export const isVivaldi = false;
export const isYaBrowser = false;
export const isOpera = false;
export const isEdge = false;
export const isSafari =
    true && true && true && true && userAgent.includes('safari') && !isChromium;
export const isWindows = platform.startsWith('win');
export const isMacOS = platform.startsWith('mac');
export const isMobile =
    isNavigatorDefined && navigator.userAgentData
        ? navigator.userAgentData.mobile
        : userAgent.includes('mobile');
export const isShadowDomSupported = typeof ShadowRoot === 'function';
export const isMatchMediaChangeEventListenerSupported = false;
// Return true if browser is known to have a bug with Media Queries, specifically Chromium on Linux and Kiwi on Android
// We assume that if we are on Android, then we are running in Kiwi since it is the only mobile browser we can install Dark Reader in
export const isMatchMediaChangeEventListenerBuggy = false;

// Note: make sure that this value matches manifest.json keys
export const isNonPersistent = true && isSafari;

export const chromiumVersion = (() => {
    const m = userAgent.match(/chrom(?:e|ium)(?:\/| )([^ ]+)/);
    if (m && m[1]) {
        return m[1];
    }
    return '';
})();

export const firefoxVersion = (() => {
    const m = userAgent.match(/(?:firefox|librewolf)(?:\/| )([^ ]+)/);
    if (m && m[1]) {
        return m[1];
    }
    return '';
})();

export const isDefinedSelectorSupported = (() => {
    try {
        document.querySelector(':defined');
        return true;
    } catch (err) {
        return false;
    }
})();

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

export const isXMLHttpRequestSupported = typeof XMLHttpRequest === 'function';

export const isFetchSupported = typeof fetch === 'function';

export const isCSSColorSchemePropSupported = (() => {
    try {
        if (typeof document === 'undefined') {
            return false;
        }
        const el = document.createElement('div');
        if (!el || typeof el.style !== 'object') {
            return false;
        }
        if (typeof el.style.colorScheme === 'string') {
            return true;
        }

        // TODO: remove the following code after enforcing strong CSP in all builds
        // This feature detection method requires weak or missing CSP in manifest.json
        el.setAttribute('style', 'color-scheme: dark');
        return el.style.colorScheme === 'dark';
    } catch (e) {
        return false;
    }
})();
