import { MessageTypeCStoBG, MessageTypeBGtoCS } from '../utils/message';
import type { MessageBGtoCS } from '../definitions';
import { readResponseAsDataURL } from '../utils/network';
import { callFetchMethod } from './fetch';

/**
 * 用于存储添加的消息监听器函数。每当接收到新的消息时，这些监听器函数将被调用
 */
const messageListeners = new Set<(message: MessageBGtoCS) => void>();

window.chrome = {
    runtime: {
        /**
         * 一个异步函数，用于发送消息
         * 当接收到内容脚本发送的FETCH类型的消息时，它会执行FETCH操作，并根据结果调用相应的监听器函数。
         * @param args
         */
        sendMessage: async function sendMessage(...args: any[]) {
            if (args[0] && args[0].type === MessageTypeCStoBG.FETCH) {
                const { id } = args[0];
                try {
                    const { url, responseType } = args[0].data;
                    const response = await callFetchMethod(url);
                    let text: string;
                    if (responseType === 'data-url') {
                        text = await readResponseAsDataURL(response);
                    } else {
                        text = await response.text();
                    }
                    messageListeners.forEach((cb) =>
                        cb({
                            type: MessageTypeBGtoCS.FETCH_RESPONSE,
                            data: text,
                            error: null,
                            id,
                        }),
                    );
                } catch (error) {
                    console.error(error);
                    messageListeners.forEach((cb) =>
                        cb({
                            type: MessageTypeBGtoCS.FETCH_RESPONSE,
                            data: null,
                            error,
                            id,
                        }),
                    );
                }
            }
        },
        // @ts-ignore
        onMessage: {
            /**
             * 一个用于添加消息监听器的函数。它将传入的回调函数添加到messageListeners集合中，以便在接收到新消息时调用。
             * @param callback
             */
            addListener: (...args: any[]) => messageListeners.add(args[0]),
        },
    },
};
