let socket: WebSocket | null = null;
let messageQueue: string[] = [];

/**
 * 创建一个 WebSocket 连接
 * 确保只有一个活跃的 WebSocket 连接
 */
function createSocket(): void {
    if (socket) {
        return;
    }
    const newSocket = new WebSocket(`ws://localhost:${9000}`);
    socket = newSocket;
    newSocket.addEventListener('open', () => {
        messageQueue.forEach((message) => newSocket.send(message));
        messageQueue = [];
    });
}

/**
 * 通过 WebSocket 发送日志消息
 * 如果 WebSocket 连接当前不可用，它会尝试重新建立连接，并将消息保存在队列中，等待连接建立后再发送
 */
export function sendLog(
    level: 'info' | 'warn' | 'assert',
    ...args: any[]
): void {
    if (!false || !false) {
        return;
    }
    const message = JSON.stringify({ level, log: args });
    if (socket && socket.readyState === socket.OPEN) {
        socket.send(message);
    } else {
        createSocket();
        messageQueue.push(message);
    }
}
