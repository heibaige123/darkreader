/**
 * 一个 5x5 的矩阵类型，其中每个元素是一个数字。
 */
export type matrix5x5 = [
    [number, number, number, number, number],
    [number, number, number, number, number],
    [number, number, number, number, number],
    [number, number, number, number, number],
    [number, number, number, number, number],
];

/**
 * 一个 5x1 的矩阵类型，其中每个元素是一个包含一个数字的数组。
 */
export type matrix5x1 = [[number], [number], [number], [number], [number]];

/**
 * 一个可以是 5x5 或 5x1 的矩阵类型。
 */
export type matrix = matrix5x5 | matrix5x1;

/**
 * 用于将输入 x 从区间 [inLow, inHigh] 映射到输出区间 [outLow, outHigh]，并返回映射后的结果。
 * @param x
 * @param inLow
 * @param inHigh
 * @param outLow
 * @param outHigh
 * @returns
 */
export function scale(
    x: number,
    inLow: number,
    inHigh: number,
    outLow: number,
    outHigh: number,
): number {
    return ((x - inLow) * (outHigh - outLow)) / (inHigh - inLow) + outLow;
}

/**
 *  用于将输入 x 限制在区间 [min, max] 内，
 * 如果 x 小于 min，则返回 min；如果 x 大于 max，则返回 max；否则返回 x。
 * @param x
 * @param min
 * @param max
 * @returns
 */
export function clamp(x: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, x));
}

// Note: the caller is responsible for ensuring that matrix dimensions make sense
/**
 * 用于将两个矩阵 m1 和 m2 相乘，返回结果矩阵。
 * @param m1
 * @param m2
 * @returns
 */
export function multiplyMatrices<M extends matrix>(
    m1: matrix5x5,
    m2: matrix5x5 | matrix5x1,
): M {
    const result: number[][] = [];
    for (let i = 0, len = m1.length; i < len; i++) {
        result[i] = [];
        for (let j = 0, len2 = m2[0].length; j < len2; j++) {
            let sum = 0;
            for (let k = 0, len3 = m1[0].length; k < len3; k++) {
                sum += m1[i][k] * m2[k][j];
            }
            result[i][j] = sum;
        }
    }
    return result as M;
}
