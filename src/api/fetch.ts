/**
 * 一个异步函数，用于在访问跨域资源时抛出CORS错误。它会返回一个被拒绝的Promise，并将CORS错误的详细信息封装在Error对象中
 * @param url
 * @returns
 */
const throwCORSError = async (url: string) => {
    return Promise.reject(
        new Error(
            [
                'Embedded Dark Reader cannot access a cross-origin resource',
                url,
                'Overview your URLs and CORS policies or use',
                '`DarkReader.setFetchMethod(fetch: (url) => Promise<Response>))`.',
                'See if using `DarkReader.setFetchMethod(window.fetch)`',
                'before `DarkReader.enable()` works.',
            ].join(' '),
        ),
    );
};

/**
 * 表示Fetch方法的类型
 */
type Fetcher = (url: string) => Promise<Response>;

/**
 * 一个Fetcher类型的变量，用于存储当前的Fetch方法。初始时，它被设置为throwCORSError函
 */
let fetcher: Fetcher = throwCORSError;

/**
 * 用于设置Fetch方法的函数。它接受一个Fetch方法作为输入，并将其赋值给fetcher变量。如果输入的Fetch方法为空（即未提供），则fetcher将被设置为throwCORSError函数。
 */
export function setFetchMethod(fetch: Fetcher): void {
    if (fetch) {
        fetcher = fetch;
    } else {
        fetcher = throwCORSError;
    }
}

/**
 * 一个异步函数，用于调用当前的Fetch方法来获取给定URL的资源
 * @param url
 * @returns
 */
export async function callFetchMethod(url: string): Promise<Response> {
    return await fetcher(url);
}
