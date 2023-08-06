/**
 * 节流效果,限制某个函数在一定时间段内的调用次数
 */
export function throttle<T extends (...args: any[]) => any>(
    callback: T,
): T & { cancel: () => void } {
    let pending = false;
    let frameId: number | null = null;
    let lastArgs: any[];

    const throttled: T = ((...args: any[]) => {
        lastArgs = args;
        if (frameId) {
            pending = true;
        } else {
            callback(...lastArgs);
            frameId = requestAnimationFrame(() => {
                frameId = null;
                if (pending) {
                    callback(...lastArgs);
                    pending = false;
                }
            });
        }
    }) as any;

    const cancel = () => {
        // TODO: reove cast once types are updated
        cancelAnimationFrame(frameId!);
        pending = false;
        frameId = null;
    };

    return Object.assign(throttled, { cancel });
}

/**
 * 添加到队列中的异步任务
 */
type Task = () => void;

/**
 * 异步任务队列
 */
interface AsyncTaskQueue {
    /**
     * 将一个新的异步任务添加到任务队列中
     */
    add: (task: Task) => void;
    /**
     * 取消队列中的所有挂起的异步任务
     */
    cancel: () => void;
}

/**
 * 创建异步任务队列
 */
export function createAsyncTasksQueue(): AsyncTaskQueue {
    const tasks: Task[] = [];
    let frameId: number | null = null;

    /**
     * 执行队列中的所有任务。当一个任务被执行后，它会从队列中移除。
     */
    function runTasks() {
        let task: Task | undefined;
        while ((task = tasks.shift())) {
            task();
        }
        frameId = null;
    }

    /**
     * 添加一个新的任务到队列
     */
    function add(task: Task) {
        tasks.push(task);
        if (!frameId) {
            frameId = requestAnimationFrame(runTasks);
        }
    }

    /**
     * 取消所有挂起的任务
     */
    function cancel() {
        tasks.splice(0);
        // TODO: reove cast once types are updated
        cancelAnimationFrame(frameId!);
        frameId = null;
    }

    return { add, cancel };
}
