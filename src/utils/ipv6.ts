/**
 * 匹配IPv6地址
 */
const simpleIPV6Regex = /\[[0-9:a-zA-Z]+?\]/;

/**
 * 判断这个URL是否是IPv6地址
 */
export function isIPV6(url: string): boolean {
    const openingBracketIndex = simpleIPV6Regex.exec(url);
    if (!openingBracketIndex) {
        return false;
    }
    const queryIndex = url.indexOf('?');
    if (queryIndex >= 0 && openingBracketIndex.index > queryIndex) {
        return false;
    }
    return true;
}

/**
 * 匹配IPv6地址和可能跟在其后的端口号
 */
const ipV6HostRegex = /\[.*?\](\:\d+)?/;

/**
 * 比较两个IPv6主机地址是否相同
 */
export function compareIPV6(firstURL: string, secondURL: string): boolean {
    const firstHost = firstURL.match(ipV6HostRegex)![0];
    const secondHost = secondURL.match(ipV6HostRegex)![0];
    return firstHost === secondHost;
}