/**
 * 允许多个异步操作等待某个条件成立（在这种情况下，是 barrier 被解决或拒绝）后再继续执行
 * 确保多个操作同时开始或结束
 */
export class PromiseBarrier<RESOLVUTION, REJECTION> {
    /**
     * 存储解决回调函数的数组
     */
    private resolves: Array<(value: RESOLVUTION) => void> = [];
    /**
     * 存储拒绝回调函数的数组
     */
    private rejects: Array<(reason: REJECTION) => void> = [];
    /**
     * 标志来跟踪这个 barrier 是否已经解决
     */
    private wasResolved = false;
    /**
     * 标志来跟踪这个 barrier 是否已经拒绝
     */
    private wasRejected = false;
    /**
     * 存储解决的原因
     */
    private resolution: RESOLVUTION;
    /**
     * 存储拒绝的原因
     */
    private reason: REJECTION;

    /**
     * 返回一个Promise对象
     */
    public async entry(): Promise<RESOLVUTION> {
        // 如果 barrier 已经解决，立即返回一个已解决的 Promise
        if (this.wasResolved) {
            return Promise.resolve(this.resolution);
        }
        // 如果 barrier 已经被拒绝，立即返回一个被拒绝的 Promise
        if (this.wasRejected) {
            return Promise.reject(this.reason);
        }
        // 创建一个新的 Promise 并将其解决和拒绝的回调存储在 resolves 和 rejects 数组中，然后返回这个新的 Promise
        return new Promise((resolve, reject) => {
            this.resolves.push(resolve);
            this.rejects.push(reject);
        });
    }

    public async resolve(value: RESOLVUTION): Promise<void> {
        // 创建一个新的 Promise 并将其解决和拒绝的回调存储在 resolves 和 rejects 数组中，然后返回这个新的 Promise
        if (this.wasRejected || this.wasResolved) {
            return;
        }
        // 将 barrier 标记为已解决，存储解决的值，并调用所有等待的解决回调，然后清空 resolves 和 rejects 数组
        this.wasResolved = true;
        this.resolution = value;
        this.resolves.forEach((resolve) => resolve(value));
        this.resolves = [];
        this.rejects = [];
        return new Promise<void>((resolve) => setTimeout(() => resolve()));
    }

    public async reject(reason: REJECTION): Promise<void> {
        // 如果 barrier 已经解决或拒绝，什么也不做
        if (this.wasRejected || this.wasResolved) {
            return;
        }
        // 将 barrier 标记为已拒绝，存储拒绝的原因，并调用所有等待的拒绝回调，然后清空 resolves 和 rejects 数组
        this.wasRejected = true;
        this.reason = reason;
        this.rejects.forEach((reject) => reject(reason));
        this.resolves = [];
        this.rejects = [];
        return new Promise<void>((resolve) => setTimeout(() => resolve()));
    }

    /**
     * 返回一个布尔值，表示异步操作是否仍处于挂起状态（未解决或未拒绝）
     */
    public isPending(): boolean {
        return !this.wasResolved && !this.wasRejected;
    }

    /**
     * 返回一个布尔值，表示异步操作是否已解决
     */
    public isFulfilled(): boolean {
        return this.wasResolved;
    }

    /**
     * 返回一个布尔值，表示异步操作是否已拒绝
     */
    public isRejected(): boolean {
        return this.wasRejected;
    }
}
