import type {Theme} from '../definitions';

interface API {
    isDarkReaderEnabled: boolean;
    theme: Partial<Theme>;
}

export const apiStore: API = {
    isDarkReaderEnabled: false,
    theme: {}
};
