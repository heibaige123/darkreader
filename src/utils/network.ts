/**
 * 用于获取网络资源的响应
 * @param url
 * @param mimeType
 * @param origin
 * @returns
 */
async function getOKResponse(
    url: string,
    mimeType?: string,
    origin?: string,
): Promise<Response> {
    const response = await fetch(url, {
        cache: 'force-cache',
        credentials: 'omit',
        referrer: origin,
    });

    // Firefox bug, content type is "application/x-unknown-content-type"
    // 在获取响应后，函数会检查响应是否成功和是否与指定的MIME类型相符。如果响应失败或MIME类型不匹配，将抛出相应的错误。
    if (
        mimeType &&
        !response.headers.get('Content-Type')!.startsWith(mimeType)
    ) {
        throw new Error(`Mime type mismatch when loading ${url}`);
    }

    if (!response.ok) {
        throw new Error(
            `Unable to load ${url} ${response.status} ${response.statusText}`,
        );
    }

    return response;
}

/**
 * 用于将网络资源加载为Data URL格式
 * @param url
 * @param mimeType
 * @returns
 */
export async function loadAsDataURL(
    url: string,
    mimeType?: string,
): Promise<string> {
    const response = await getOKResponse(url, mimeType);
    return await readResponseAsDataURL(response);
}

/**
 * 接受一个Response对象，并将其内容读取为Data URL格式。它先将响应转换为Blob对象，
 * 然后使用FileReader异步地将Blob对象读取为Data URL，并最终将Data URL返回
 * @param response
 * @returns
 */
export async function readResponseAsDataURL(
    response: Response,
): Promise<string> {
    const blob = await response.blob();
    const dataURL = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });
    return dataURL;
}

/**
 * 将网络资源加载为文本格式
 * @param url
 * @param mimeType
 * @param origin
 * @returns
 */
export async function loadAsText(
    url: string,
    mimeType?: string,
    origin?: string,
): Promise<string> {
    const response = await getOKResponse(url, mimeType, origin);
    return await response.text();
}
