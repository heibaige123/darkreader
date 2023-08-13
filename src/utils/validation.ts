import { DEFAULT_SETTINGS, DEFAULT_THEME } from '../defaults';
import type {
    UserSettings,
    Theme,
    ThemePreset,
    CustomSiteConfig,
    TimeSettings,
    LocationSettings,
    Automation,
} from '../definitions';
import { AutomationMode } from './automation';

/**
 * 检查一个值是否是布尔类型
 * @param x
 * @returns
 */
function isBoolean(x: any): x is boolean {
    return typeof x === 'boolean';
}

/**
 * 检查一个值是否是纯对象
 * @param x
 * @returns
 */
function isPlainObject(x: any): x is Record<string, unknown> {
    return typeof x === 'object' && x != null && !Array.isArray(x);
}
/**
 * 检查一个值是否是数组
 * @param x
 * @returns
 */
function isArray(x: any) {
    return Array.isArray(x);
}
/**
 * 检查一个值是否是字符串
 */
function isString(x: any): x is string {
    return typeof x === 'string';
}
/**
 * 检查一个值是否是非空字符串。
 */
function isNonEmptyString(x: any): x is string {
    return x && isString(x);
}
/**
 * 检查一个值是否是包含非空字符串的数组。
 */
function isNonEmptyArrayOfNonEmptyStrings(x: any): x is any[] {
    return (
        Array.isArray(x) && x.length > 0 && x.every((s) => isNonEmptyString(s))
    );
}
/**
 * 返回一个函数，该函数检查一个值是否匹配给定的正则表达式。
 */
function isRegExpMatch(regexp: RegExp) {
    return (x: any): x is string => {
        return isString(x) && x.match(regexp) != null;
    };
}
/**
 * 检查给定的字符串是否符合时间格式。
 * 这个正则表达式可以匹配从 00:00 到 23:59 的任何时间
 */
const isTime = isRegExpMatch(/^((0?[0-9])|(1[0-9])|(2[0-3])):([0-5][0-9])$/);
/**
 * 检查一个值是否是数字。
 */
function isNumber(x: any): x is number {
    return typeof x === 'number' && !isNaN(x);
}
/**
 * 返回一个函数，该函数检查一个值是否在给定的范围内。
 */
function isNumberBetween(min: number, max: number) {
    return (x: any): x is number => {
        return isNumber(x) && x >= min && x <= max;
    };
}
/**
 * 返回一个函数，该函数检查一个值是否在给定的值列表中。
 */
function isOneOf(...values: any[]) {
    return (x: any) => values.includes(x);
}
/**
 * 检查一个对象是否具有所有必需的属性。
 */
function hasRequiredProperties<T extends Record<string, unknown>>(
    obj: T,
    keys: Array<keyof T>,
) {
    return keys.every((key) => obj.hasOwnProperty(key));
}
/**
 * 这个函数返回一个对象，包含了用于验证属性和数组的方法，以及一个收集错误的数组。
 */
function createValidator() {
    const errors: string[] = [];

    function validateProperty<T extends Record<string, unknown>>(
        obj: T,
        key: keyof T,
        validator: (x: any) => boolean,
        fallback: T,
    ) {
        if (!obj.hasOwnProperty(key) || validator(obj[key])) {
            return;
        }
        errors.push(
            `Unexpected value for "${key as string}": ${JSON.stringify(
                obj[key],
            )}`,
        );
        obj[key] = fallback[key];
    }

    function validateArray<T extends Record<string, unknown>, V>(
        obj: T,
        key: keyof T,
        validator: (x: V) => boolean,
    ) {
        if (!obj.hasOwnProperty(key)) {
            return;
        }
        const wrongValues = new Set();
        const arr: any[] = obj[key] as any;
        for (let i = 0; i < arr.length; i++) {
            if (!validator(arr[i])) {
                wrongValues.add(arr[i]);
                arr.splice(i, 1);
                i--;
            }
        }
        if (wrongValues.size > 0) {
            errors.push(
                `Array "${key as string}" has wrong values: ${Array.from(
                    wrongValues,
                )
                    .map((v) => JSON.stringify(v))
                    .join('; ')}`,
            );
        }
    }

    return { validateProperty, validateArray, errors };
}
/**
 *
 */
interface SettingValidationResult {
    settings: Partial<UserSettings>;
    errors: string[];
}
/**
 * 验证用户设置是否合法
 */
export function validateSettings(
    settings: Partial<UserSettings>,
): SettingValidationResult {
    if (!isPlainObject(settings)) {
        return {
            errors: ['Settings are not a plain object'],
            settings: DEFAULT_SETTINGS,
        };
    }

    const { validateProperty, validateArray, errors } = createValidator();
    const isValidPresetTheme = (theme: Theme) => {
        if (!isPlainObject(theme)) {
            return false;
        }
        const { errors: themeErrors } = validateTheme(theme);
        return themeErrors.length === 0;
    };

    validateProperty(settings, 'enabled', isBoolean, DEFAULT_SETTINGS);
    validateProperty(settings, 'fetchNews', isBoolean, DEFAULT_SETTINGS);

    validateProperty(settings, 'theme', isPlainObject, DEFAULT_SETTINGS);
    const { errors: themeErrors } = validateTheme(settings.theme);
    errors.push(...themeErrors);

    validateProperty(settings, 'presets', isArray, DEFAULT_SETTINGS);
    validateArray(settings, 'presets', (preset: ThemePreset) => {
        const presetValidator = createValidator();
        if (
            !(
                isPlainObject(preset) &&
                hasRequiredProperties(preset, ['id', 'name', 'urls', 'theme'])
            )
        ) {
            return false;
        }
        presetValidator.validateProperty(
            preset,
            'id',
            isNonEmptyString,
            preset,
        );
        presetValidator.validateProperty(
            preset,
            'name',
            isNonEmptyString,
            preset,
        );
        presetValidator.validateProperty(
            preset,
            'urls',
            isNonEmptyArrayOfNonEmptyStrings,
            preset,
        );
        presetValidator.validateProperty(
            preset,
            'theme',
            isValidPresetTheme,
            preset,
        );
        return presetValidator.errors.length === 0;
    });

    validateProperty(settings, 'customThemes', isArray, DEFAULT_SETTINGS);
    validateArray(settings, 'customThemes', (custom: CustomSiteConfig) => {
        if (
            !(
                isPlainObject(custom) &&
                hasRequiredProperties(custom, ['url', 'theme'])
            )
        ) {
            return false;
        }
        const presetValidator = createValidator();
        presetValidator.validateProperty(
            custom,
            'url',
            isNonEmptyArrayOfNonEmptyStrings,
            custom,
        );
        presetValidator.validateProperty(
            custom,
            'theme',
            isValidPresetTheme,
            custom,
        );
        return presetValidator.errors.length === 0;
    });

    validateProperty(settings, 'siteList', isArray, DEFAULT_SETTINGS);
    validateArray(settings, 'siteList', isNonEmptyString);
    validateProperty(settings, 'siteListEnabled', isArray, DEFAULT_SETTINGS);
    validateArray(settings, 'siteListEnabled', isNonEmptyString);

    validateProperty(
        settings,
        'applyToListedOnly',
        isBoolean,
        DEFAULT_SETTINGS,
    );
    validateProperty(
        settings,
        'changeBrowserTheme',
        isBoolean,
        DEFAULT_SETTINGS,
    );
    validateProperty(settings, 'syncSettings', isBoolean, DEFAULT_SETTINGS);
    validateProperty(settings, 'syncSitesFixes', isBoolean, DEFAULT_SETTINGS);
    validateProperty(
        settings,
        'automation',
        (automation: Automation) => {
            if (!isPlainObject(automation)) {
                return false;
            }

            const automationValidator = createValidator();
            automationValidator.validateProperty(
                automation,
                'enabled',
                isBoolean,
                automation,
            );
            automationValidator.validateProperty(
                automation,
                'mode',
                isOneOf(
                    AutomationMode.SYSTEM,
                    AutomationMode.TIME,
                    AutomationMode.LOCATION,
                    AutomationMode.NONE,
                ),
                automation,
            );
            automationValidator.validateProperty(
                automation,
                'behavior',
                isOneOf('OnOff', 'Scheme'),
                automation,
            );
            return automationValidator.errors.length === 0;
        },
        DEFAULT_SETTINGS,
    );

    validateProperty(
        settings,
        AutomationMode.TIME,
        (time: TimeSettings) => {
            if (!isPlainObject(time)) {
                return false;
            }
            const timeValidator = createValidator();
            timeValidator.validateProperty(time, 'activation', isTime, time);
            timeValidator.validateProperty(time, 'deactivation', isTime, time);
            return timeValidator.errors.length === 0;
        },
        DEFAULT_SETTINGS,
    );

    validateProperty(
        settings,
        AutomationMode.LOCATION,
        (location: LocationSettings) => {
            if (!isPlainObject(location)) {
                return false;
            }
            const locValidator = createValidator();
            const isValidLoc = (x: any) => x === null || isNumber(x);
            locValidator.validateProperty(
                location,
                'latitude',
                isValidLoc,
                location,
            );
            locValidator.validateProperty(
                location,
                'longitude',
                isValidLoc,
                location,
            );
            return locValidator.errors.length === 0;
        },
        DEFAULT_SETTINGS,
    );

    validateProperty(settings, 'previewNewDesign', isBoolean, DEFAULT_SETTINGS);
    validateProperty(settings, 'enableForPDF', isBoolean, DEFAULT_SETTINGS);
    validateProperty(
        settings,
        'enableForProtectedPages',
        isBoolean,
        DEFAULT_SETTINGS,
    );
    validateProperty(
        settings,
        'enableContextMenus',
        isBoolean,
        DEFAULT_SETTINGS,
    );
    validateProperty(settings, 'detectDarkTheme', isBoolean, DEFAULT_SETTINGS);

    return { errors, settings };
}
/**
 *
 */
interface ThemeValidationResult {
    theme: Partial<Theme>;
    errors: string[];
}
/**
 * 验证主题配置是否合法
 */
export function validateTheme(
    theme: Partial<Theme> | null | undefined,
): ThemeValidationResult {
    if (!isPlainObject(theme)) {
        return {
            errors: ['Theme is not a plain object'],
            theme: DEFAULT_THEME,
        };
    }

    const { validateProperty, errors } = createValidator();
    validateProperty(theme, 'mode', isOneOf(0, 1), DEFAULT_THEME);
    validateProperty(
        theme,
        'brightness',
        isNumberBetween(0, 200),
        DEFAULT_THEME,
    );
    validateProperty(theme, 'contrast', isNumberBetween(0, 200), DEFAULT_THEME);
    validateProperty(
        theme,
        'grayscale',
        isNumberBetween(0, 100),
        DEFAULT_THEME,
    );
    validateProperty(theme, 'sepia', isNumberBetween(0, 100), DEFAULT_THEME);
    validateProperty(theme, 'useFont', isBoolean, DEFAULT_THEME);
    validateProperty(theme, 'fontFamily', isNonEmptyString, DEFAULT_THEME);
    validateProperty(theme, 'textStroke', isNumberBetween(0, 1), DEFAULT_THEME);
    validateProperty(
        theme,
        'engine',
        isOneOf('dynamicTheme', 'staticTheme', 'cssFilter', 'svgFilter'),
        DEFAULT_THEME,
    );
    validateProperty(theme, 'stylesheet', isString, DEFAULT_THEME);
    validateProperty(
        theme,
        'darkSchemeBackgroundColor',
        isRegExpMatch(/^#[0-9a-f]{6}$/i),
        DEFAULT_THEME,
    );
    validateProperty(
        theme,
        'darkSchemeTextColor',
        isRegExpMatch(/^#[0-9a-f]{6}$/i),
        DEFAULT_THEME,
    );
    validateProperty(
        theme,
        'lightSchemeBackgroundColor',
        isRegExpMatch(/^#[0-9a-f]{6}$/i),
        DEFAULT_THEME,
    );
    validateProperty(
        theme,
        'lightSchemeTextColor',
        isRegExpMatch(/^#[0-9a-f]{6}$/i),
        DEFAULT_THEME,
    );
    validateProperty(
        theme,
        'scrollbarColor',
        (x: any) => x === '' || isRegExpMatch(/^(auto)|(#[0-9a-f]{6})$/i)(x),
        DEFAULT_THEME,
    );
    validateProperty(
        theme,
        'selectionColor',
        isRegExpMatch(/^(auto)|(#[0-9a-f]{6})$/i),
        DEFAULT_THEME,
    );
    validateProperty(theme, 'styleSystemControls', isBoolean, DEFAULT_THEME);
    validateProperty(
        theme,
        'lightColorScheme',
        isNonEmptyString,
        DEFAULT_THEME,
    );
    validateProperty(theme, 'darkColorScheme', isNonEmptyString, DEFAULT_THEME);
    validateProperty(theme, 'immediateModify', isBoolean, DEFAULT_THEME);

    return { errors, theme };
}
