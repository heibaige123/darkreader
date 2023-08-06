import { PromiseBarrier } from './promise-barrier';

/*
 * This class synchronizes some JS object's attributes and data stored in
 * chrome.storage.local, with minimal delay. It follows these principles:
 *  - no debouncing, data is saved as soon as saveState() is called
 *  - no concurrent writes (calls to s.c.l.set()): if saveState() is called
 *    repeatedly before previous call is complete, this class will wait for
 *    active write to complete and will save new data.
 *  - no concurrent reads (calls to s.c.l.get()): if loadState() is called
 *    repeatedly before previous call is complete, this class will wait for
 *    active read to complete and will resolve all loadState() calls at once.
 *  - all simultaniously active calls to saveState() and loadState() wait for
 *    data to settle and resolve only after data is guaranteed to be coherent.
 *  - data saved with the browser always wins (because JS typically has only
 *    default values and to ensure that if the same class exists in multiple
 *    contexts every instance of this class has the same values)
 * In practice, these principles imply that at any given moment there is either
 * no active read and write operations or this class is performing exactly one
 * read or exactly one write operation.
 *
 * State manager is a state machine which works as follows:
 *       +-----------+
 *       |  Initial  |
 *       +-----------+
 *              |
 *              | StateManagerImpl.loadState() is called,
 *              | StateManagerImpl will call chrome.storage.local.get()
 *              |
 *              v
 *       +------------+
 * +-----|  Loading R |
 * |     +------------+
 * |            |
 * |            | chrome.storage.local.get() callback is called,
 * | [1]        | StateManagerImpl has loaded the data.
 * |            |
 * |            v
 * |      +----------+<-------------------------------------------+
 * |      |  Ready   |                                            |
 * |      +----------+<-------------------------------------+     |
 * |            |                                           |     |
 * |            | StateManagerImpl.saveState() is called,   |     |
 * |            | StateManagerImpl will callect data and    |     |
 * |            | call chrome.storage.local.set()           |     |
 * |            v                                           |     |
 * |     +-----------+--------------------------------------+     |
 * |  +--|  Saving W |                                            |
 * |  |  +-----------+<-------------------------------------+     |
 * |  |         |                                           |     |
 * |  |         | StateManagerImpl.saveState() is called    |     |
 * |  |         | before ongoing write operation ends.      |     |
 * |  |         |                                           |     |
 * |  |         v                                           |     |
 * |  |  +-------------------+                              |     |
 * |  |  | Saving Override W |------------------------------+     |
 * |  |  +-------------------+                                    |
 * |  |         |                                                 |
 * |  |         |     onChange handler is called during an active |
 * |  | [1]     | [1] read/write operation                        |
 * |  |         |                                                 |
 * |  |         v                                                 |
 * |  +->+-------------------+       +------------+               |
 * |     | OnChange Race R/W |------>| Recovery R |---------------+
 * +---->+-------------------+       +------------+
 *                 ^                       |
 *                 +---------------------- +
 *                             [1]
 *
 * R and W indicate active read (get) and write (set) operations.
 *
 * Initial - Only constructor was called.
 * Loading - loadState() is called
 * Ready - data was retreived from storage.
 * Saving - saveState() is called and there is no chrome.storage.local.set()
 *   operation in progress. We just need to collect and save the data.
 * Saving Override - saveState() is called before the last write operation
 *   was complete (data became obsolete even before it was written to storage).
 *   We wait for ongoing write operation to end and only then start a new one.
 * OnChange Race - chrome.storage.onChanged listener was called during an active
 *   read/write operation. StateManager needs to wait for that operation to end
 *   and re-request data again.
 * Recovery - state manager detected a race condition, probably caused by an
 *   onChanged event during data loading or saving. State Manager will load data
 *   from browser to ensure data coherence.
 */

/**
 * 状态管理器的状态
 */
const enum StateManagerImplState {
    /**
     * 仅调用构造函数
     */
    INITIAL = 0,
    /**
     * loadState() 被调用
     */
    LOADING = 1,
    /**
     * 数据已从存储中检索
     */
    READY = 2,
    /**
     * saveState() 被调用并且没有 chrome.storage.local.set()
     * 操作正在进行中。我们只需要收集并保存数据。
     */
    SAVING = 3,
    /**
     * saveState() 在最后一次写入操作之前调用
     * 已完成（数据甚至在写入存储之前就已过时）
     * 我们等待正在进行的写入操作结束，然后才开始新的写入操作
     */
    SAVING_OVERRIDE = 4,
    /**
     * chrome.storage.onChanged 侦听器在活动期间被调用
     * 读/写操作。 StateManager需要等待该操作结束
     * 并再次重新请求数据
     */
    ONCHANGE_RACE = 5,
    /**
     * 状态管理器检测到竞争条件，可能是由数据加载或保存期间的 onChanged 事件。状态管理器将加载数据
     * 来自浏览器以确保数据一致性
     */
    RECOVERY = 6,
}

/**
 * 负责管理和持久化状态
 * 状态管理器特别是用来与浏览器的 chrome.storage API 交互，用于保存和加载状态
 */
export class StateManagerImpl<T extends Record<string, unknown>> {
    /**
     * 用于在浏览器存储中标识状态的键
     */
    private localStorageKey: string;
    private parent;
    /**
     * 状态的默认值
     */
    private defaults: T;
    private logWarn: (log: string) => void;

    /**
     * 表示当前状态管理器的状态的枚举值
     */
    private meta: StateManagerImplState;
    /**
     * 同步状态管理操作
     */
    private barrier: PromiseBarrier<void, void> | null = null;
    /**
     * 提供方法来从存储中获取和设置数据的对象
     */
    private storage: {
        get: (
            storageKey: string,
            callback: (items: { [key: string]: any }) => void,
        ) => void;
        set: (items: { [key: string]: any }, callback: () => void) => void;
    };
    /**
     * 一个集合，其中包含当状态改变时应该被通知的回调函数
     */
    private listeners: Set<() => void>;

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public constructor(
        localStorageKey: string,
        parent: any,
        defaults: T,
        storage: {
            get: (
                storageKey: string,
                callback: (items: { [key: string]: any }) => void,
            ) => void;
            set: (items: { [key: string]: any }, callback: () => void) => void;
        },
        addListener: (listener: (data: T) => void) => void,
        logWarn: (log: string) => void,
    ) {
        this.localStorageKey = localStorageKey;
        this.parent = parent;
        this.defaults = defaults;
        this.storage = storage;
        addListener((change) => this.onChange(change));
        this.logWarn = logWarn;

        this.meta = StateManagerImplState.INITIAL;
        this.barrier = new PromiseBarrier();
        this.listeners = new Set();

        // TODO(Anton): consider calling this.loadState() to preload data,
        // and remove StateManagerImplState.INITIAL.
    }

    /**
     * 从父对象中收集当前状态
     */
    private collectState() {
        const state = {} as T;
        for (const key of Object.keys(this.defaults) as Array<keyof T>) {
            state[key] = this.parent[key] || this.defaults[key];
        }
        return state;
    }

    /**
     * 将状态应用到父对象
     */
    private applyState(storage: T) {
        Object.assign(this.parent, this.defaults, storage);
    }

    /**
     * “释放”当前的 PromiseBarrier
     */
    private releaseBarrier() {
        const barrier = this.barrier;
        this.barrier = new PromiseBarrier();
        barrier!.resolve();
    }

    /**
     * 通知所有注册的监听器
     */
    private notifyListeners() {
        this.listeners.forEach((listener) => listener());
    }

    /**
     * 当状态更改时，基于当前的 meta 状态进行相应的处理
     */
    private onChange(state: T) {
        switch (this.meta) {
            case StateManagerImplState.INITIAL:
                this.meta = StateManagerImplState.READY;
            // fallthrough
            case StateManagerImplState.READY:
                this.applyState(state);
                this.notifyListeners();
                return;
            case StateManagerImplState.LOADING:
                this.meta = StateManagerImplState.ONCHANGE_RACE;
                return;
            case StateManagerImplState.SAVING:
                this.meta = StateManagerImplState.ONCHANGE_RACE;
                return;
            case StateManagerImplState.SAVING_OVERRIDE:
                this.meta = StateManagerImplState.ONCHANGE_RACE;
                break;
            case StateManagerImplState.ONCHANGE_RACE:
                // We are already waiting for an active read/write operation to end
                break;
            case StateManagerImplState.RECOVERY:
                this.meta = StateManagerImplState.ONCHANGE_RACE;
                break;
        }
    }

    /**
     * 使用 chrome.storage API 保存状态
     */
    private saveStateInternal() {
        this.storage.set(
            { [this.localStorageKey]: this.collectState() },
            () => {
                switch (this.meta) {
                    case StateManagerImplState.INITIAL:
                    // fallthrough
                    case StateManagerImplState.LOADING:
                    // fallthrough
                    case StateManagerImplState.READY:
                    // fallthrough
                    case StateManagerImplState.RECOVERY:
                        this.logWarn('Unexpected state. Possible data race!');
                        this.meta = StateManagerImplState.ONCHANGE_RACE;
                        this.loadStateInternal();
                        return;
                    case StateManagerImplState.SAVING:
                        this.meta = StateManagerImplState.READY;
                        this.releaseBarrier();
                        return;
                    case StateManagerImplState.SAVING_OVERRIDE:
                        this.meta = StateManagerImplState.SAVING;
                        this.saveStateInternal();
                        return;
                    case StateManagerImplState.ONCHANGE_RACE:
                        this.meta = StateManagerImplState.RECOVERY;
                        this.loadStateInternal();
                }
            },
        );
    }

    // This function is not guaranteed to save state before returning
    /**
     * 根据当前的 meta 状态保存状态
     */
    public async saveState(): Promise<void> {
        switch (this.meta) {
            case StateManagerImplState.INITIAL:
                // Make sure not to overwrite data before it is loaded
                this.logWarn(
                    'StateManager.saveState was called before StateManager.loadState(). Possible data race! Loading data instead.',
                );
                return this.loadState();
            case StateManagerImplState.LOADING:
                // Need to wait for active read operation to end
                this.logWarn(
                    'StateManager.saveState was called before StateManager.loadState() resolved. Possible data race! Loading data instead.',
                );
                return this.barrier!.entry();
            case StateManagerImplState.READY:
                this.meta = StateManagerImplState.SAVING;
                const entry = this.barrier!.entry();
                this.saveStateInternal();
                return entry;
            case StateManagerImplState.SAVING:
                // Another save is in progress
                this.meta = StateManagerImplState.SAVING_OVERRIDE;
                return this.barrier!.entry();
            case StateManagerImplState.SAVING_OVERRIDE:
                return this.barrier!.entry();
            case StateManagerImplState.ONCHANGE_RACE:
                this.logWarn(
                    'StateManager.saveState was called during active read/write operation. Possible data race! Loading data instead.',
                );
                return this.barrier!.entry();
            case StateManagerImplState.RECOVERY:
                this.logWarn(
                    'StateManager.saveState was called during active read operation. Possible data race! Waiting for data load instead.',
                );
                return this.barrier!.entry();
        }
    }

    /**
     * 使用 chrome.storage API 加载状态
     */
    private loadStateInternal() {
        this.storage.get(this.localStorageKey, (data: any) => {
            switch (this.meta) {
                case StateManagerImplState.INITIAL:
                case StateManagerImplState.READY:
                case StateManagerImplState.SAVING:
                case StateManagerImplState.SAVING_OVERRIDE:
                    this.logWarn('Unexpected state. Possible data race!');
                    return;
                case StateManagerImplState.LOADING:
                    this.meta = StateManagerImplState.READY;
                    this.applyState(data[this.localStorageKey]);
                    this.releaseBarrier();
                    return;
                case StateManagerImplState.ONCHANGE_RACE:
                    this.meta = StateManagerImplState.RECOVERY;
                    this.loadStateInternal();
                case StateManagerImplState.RECOVERY:
                    this.meta = StateManagerImplState.READY;
                    this.applyState(data[this.localStorageKey]);
                    this.releaseBarrier();
                    this.notifyListeners();
            }
        });
    }

    /**
     * 根据当前的 meta 状态加载状态
     */
    public async loadState(): Promise<void> {
        switch (this.meta) {
            case StateManagerImplState.INITIAL:
                this.meta = StateManagerImplState.LOADING;
                const entry = this.barrier!.entry();
                this.loadStateInternal();
                return entry;
            case StateManagerImplState.READY:
                return;
            case StateManagerImplState.SAVING:
                return this.barrier!.entry();
            case StateManagerImplState.SAVING_OVERRIDE:
                return this.barrier!.entry();
            case StateManagerImplState.LOADING:
                return this.barrier!.entry();
            case StateManagerImplState.ONCHANGE_RACE:
                return this.barrier!.entry();
            case StateManagerImplState.RECOVERY:
                return this.barrier!.entry();
        }
    }

    /**
     * 添加一个新的状态更改监听器
     */
    public addChangeListener(callback: () => void): void {
        this.listeners.add(callback);
    }

    public getStateForTesting(): string {
        return '';
    }
}
