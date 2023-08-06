/**
 * 将一个数字转换成它的16进制表示形式的字符串
 */
function hexify(number: number): string {
    return (number < 16 ? '0' : '') + number.toString(16);
}

/**
 * 生成唯一标识符（UUID）的函数
 */
export function generateUID(): string {
    if ('randomUUID' in crypto) {
        const uuid = crypto.randomUUID();
        return (
            uuid.substring(0, 8) +
            uuid.substring(9, 13) +
            uuid.substring(14, 18) +
            uuid.substring(19, 23) +
            uuid.substring(24)
        );
    }

    if ('getRandomValues' in crypto) {
        return Array.from(
            (crypto as Crypto).getRandomValues(new Uint8Array(16)),
        )
            .map((x) => hexify(x))
            .join('');
    }

    return Math.floor(Math.random() * 2 ** 55).toString(36);
}
