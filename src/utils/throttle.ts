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

type Task = () => void;

interface AsyncTaskQueue {
    add: (task: Task) => void;
    cancel: () => void;
}

export function createAsyncTasksQueue(): AsyncTaskQueue {
    const tasks: Task[] = [];
    let frameId: number | null = null;

    function runTasks() {
        let task: Task | undefined;
        while ((task = tasks.shift())) {
            task();
        }
        frameId = null;
    }

    function add(task: Task) {
        tasks.push(task);
        if (!frameId) {
            frameId = requestAnimationFrame(runTasks);
        }
    }

    function cancel() {
        tasks.splice(0);
        // TODO: reove cast once types are updated
        cancelAnimationFrame(frameId!);
        frameId = null;
    }

    return { add, cancel };
}
