/**
 * 表示队列中的条目
 * 一个函数类型，该函数不接收任何参数，也不返回任何值（即空返回类型）
 */
export type QueueEntry = () => void;

// AsyncQueue is a class that helps with managing tasks.
// More specifically, it helps with tasks that are often used.
// It's fully asyncronous and uses promises and tries to get 60FPS.
/**
 * 管理和执行一个异步任务队列
 * 确保在每个浏览器的帧刷新间隔（约16.67ms，即60FPS）中执行尽可能多的任务，而不会阻塞整个帧
 */
export default class AsyncQueue {
    /**
     * 存储 QueueEntry 类型的任务的数组
     */
    private queue: QueueEntry[] = [];

    /**
     * 存储 requestAnimationFrame 的ID
     */
    private timerId: number | null = null;

    /**
     * 帧的持续时间，这里设置为大约16.67ms（即60FPS）
     */
    private frameDuration = 1000 / 60;

    /**
     * 将新的 QueueEntry 任务添加到队列中，并启动队列
     */
    public addToQueue(entry: QueueEntry): void {
        this.queue.push(entry);
        this.startQueue();
    }

    /**
     * 停止队列的执行，取消任何挂起的 requestAnimationFrame 调用，并清空队列
     */
    public stopQueue(): void {
        if (this.timerId !== null) {
            cancelAnimationFrame(this.timerId);
            this.timerId = null;
        }
        this.queue = [];
    }

    // Ensures 60FPS.
    /**
     * 用于开始处理队列中的任务。它使用 requestAnimationFrame 来确保任务在浏览器的帧刷新间隔中执行
     * 
     */
    private startQueue(): void {
        if (this.timerId) {
            return;
        }
        this.timerId = requestAnimationFrame(() => {
            this.timerId = null;
            const start = Date.now();
            let cb: QueueEntry | undefined;
            while ((cb = this.queue.shift())) {
                cb();
                // 在每个帧的刷新间隔中，它会尝试执行尽可能多的任务，直到达到 frameDuration 限制
                if (Date.now() - start >= this.frameDuration) {
                    // 如果队列中的任务没有在当前帧刷新间隔中完成，它将重新启动队列来处理剩余的任务
                    this.startQueue();
                    break;
                }
            }
        });
    }
}
