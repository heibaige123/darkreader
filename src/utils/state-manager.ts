/**
 * This class exists only to simplify Jest testing of the real implementation
 * which is in StateManagerImpl class.
 */

import { StateManagerImpl } from './state-manager-impl';

/**
 * 管理状态
 */
export class StateManager<T extends Record<string, unknown>> {
    private stateManager: StateManagerImpl<T> | null;

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public constructor(
        localStorageKey: string,
        parent: any,
        defaults: T,
        logWarn: (log: string) => void,
    ) {}

    /**
     * 检查 stateManager 是否存在。如果存在，它将调用 stateManager 的 saveState 方法
     */
    public async saveState(): Promise<void> {
        if (this.stateManager) {
            return this.stateManager.saveState();
        }
    }

    /**
     * 检查 stateManager 是否存在。如果存在，它将调用 stateManager 的 loadState 方法
     */
    public async loadState(): Promise<void> {
        if (this.stateManager) {
            return this.stateManager.loadState();
        }
    }
}
