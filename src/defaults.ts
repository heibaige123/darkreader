import type { ParsedColorSchemeConfig } from './utils/colorscheme-parser';
import type { Theme, UserSettings } from './definitions';
import { ThemeEngine } from './generators/theme-engines';
import { AutomationMode } from './utils/automation';

export const DEFAULT_COLORS = {
    darkScheme: {
        background: '#181a1b',
        text: '#e8e6e3',
    },
    lightScheme: {
        background: '#dcdad7',
        text: '#181a1b',
    },
};

export const DEFAULT_THEME: Theme = {
    mode: 1,
    brightness: 100,
    contrast: 100,
    grayscale: 0,
    sepia: 0,
    useFont: false,
    fontFamily: false ? 'Helvetica Neue' : false ? 'Segoe UI' : 'Open Sans',
    textStroke: 0,
    engine: ThemeEngine.dynamicTheme,
    stylesheet: '',
    darkSchemeBackgroundColor: '#181a1b',
    darkSchemeTextColor: '#e8e6e3',
    lightSchemeBackgroundColor: '#dcdad7',
    lightSchemeTextColor: '#181a1b',
    scrollbarColor: false ? '' : 'auto',
    selectionColor: 'auto',
    styleSystemControls: false,
    lightColorScheme: 'Default',
    darkColorScheme: 'Default',
    immediateModify: false,
};

export const DEFAULT_COLORSCHEME: ParsedColorSchemeConfig = {
    light: {
        Default: {
            backgroundColor: '#dcdad7',
            textColor: '#181a1b',
        },
    },
    dark: {
        Default: {
            backgroundColor: '#181a1b',
            textColor: '#e8e6e3',
        },
    },
};

export const DEFAULT_SETTINGS: UserSettings = {
    enabled: true,
    fetchNews: true,
    theme: DEFAULT_THEME,
    presets: [],
    customThemes: [],
    siteList: [],
    siteListEnabled: [],
    applyToListedOnly: false,
    changeBrowserTheme: false,
    syncSettings: true,
    syncSitesFixes: false,
    automation: {
        enabled: false,
        mode: AutomationMode.NONE,
        behavior: 'OnOff',
    },
    time: {
        activation: '18:00',
        deactivation: '9:00',
    },
    location: {
        latitude: null,
        longitude: null,
    },
    previewNewDesign: false,
    enableForPDF: true,
    enableForProtectedPages: false,
    enableContextMenus: false,
    detectDarkTheme: false,
};
