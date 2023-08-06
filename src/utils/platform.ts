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
