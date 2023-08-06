import { clamp, multiplyMatrices } from '../../utils/math';
import type { matrix5x1, matrix5x5 } from '../../utils/math';
import type { FilterConfig } from '../../definitions';

/**
 * 根据传入的 FilterConfig 配置对象创建一个 5x5 的颜色矩阵。
 * 根据 config 中的不同参数，
 * 该函数会按顺序应用 Sepia、Grayscale、Contrast、Brightness
 *  和 Invert Hue（反转色调）的变换，然后返回最终的颜色矩阵。
 * @param config
 * @returns
 */
export function createFilterMatrix(config: FilterConfig): matrix5x5 {
    let m: matrix5x5 = Matrix.identity();
    if (config.sepia !== 0) {
        m = multiplyMatrices(m, Matrix.sepia(config.sepia / 100));
    }
    if (config.grayscale !== 0) {
        m = multiplyMatrices(m, Matrix.grayscale(config.grayscale / 100));
    }
    if (config.contrast !== 100) {
        m = multiplyMatrices(m, Matrix.contrast(config.contrast / 100));
    }
    if (config.brightness !== 100) {
        m = multiplyMatrices(m, Matrix.brightness(config.brightness / 100));
    }
    if (config.mode === 1) {
        m = multiplyMatrices(m, Matrix.invertNHue());
    }
    return m;
}

/**
 * 用于应用颜色矩阵到一个 RGB 颜色上。它接收一个包含 RGB 分量
 * 值的数组 [r, g, b] 和一个 5x5 的颜色矩阵 matrix，
 * 然后将该颜色矩阵应用到 RGB 颜色上，并返回处理后的 RGB 分量值。
 * @param param0
 * @param matrix
 * @returns
 */
export function applyColorMatrix(
    [r, g, b]: [number, number, number],
    matrix: matrix5x5,
): [number, number, number] {
    const rgb: matrix5x1 = [[r / 255], [g / 255], [b / 255], [1], [1]];
    const result = multiplyMatrices<matrix5x1>(matrix, rgb);
    return [0, 1, 2].map((i) =>
        clamp(Math.round(result[i][0] * 255), 0, 255),
    ) as [number, number, number];
}

/**
 * 一个对象，包含了一些静态方法用于创建不同类型的颜色矩阵
 */
export const Matrix = {
    /**
     * 单位矩阵
     * @returns
     */
    identity(): matrix5x5 {
        return [
            [1, 0, 0, 0, 0],
            [0, 1, 0, 0, 0],
            [0, 0, 1, 0, 0],
            [0, 0, 0, 1, 0],
            [0, 0, 0, 0, 1],
        ];
    },

    /**
     * 反转色调矩阵
     * @returns
     */
    invertNHue(): matrix5x5 {
        return [
            [0.333, -0.667, -0.667, 0, 1],
            [-0.667, 0.333, -0.667, 0, 1],
            [-0.667, -0.667, 0.333, 0, 1],
            [0, 0, 0, 1, 0],
            [0, 0, 0, 0, 1],
        ];
    },

    /**
     * 亮度矩阵
     * @param v
     * @returns
     */
    brightness(v: number): matrix5x5 {
        return [
            [v, 0, 0, 0, 0],
            [0, v, 0, 0, 0],
            [0, 0, v, 0, 0],
            [0, 0, 0, 1, 0],
            [0, 0, 0, 0, 1],
        ];
    },

    /**
     * 对比度矩阵
     * @param v
     * @returns
     */
    contrast(v: number): matrix5x5 {
        const t = (1 - v) / 2;
        return [
            [v, 0, 0, 0, t],
            [0, v, 0, 0, t],
            [0, 0, v, 0, t],
            [0, 0, 0, 1, 0],
            [0, 0, 0, 0, 1],
        ];
    },

    /**
     * 褐色矩阵
     * @param v
     * @returns
     */
    sepia(v: number): matrix5x5 {
        return [
            [
                0.393 + 0.607 * (1 - v),
                0.769 - 0.769 * (1 - v),
                0.189 - 0.189 * (1 - v),
                0,
                0,
            ],
            [
                0.349 - 0.349 * (1 - v),
                0.686 + 0.314 * (1 - v),
                0.168 - 0.168 * (1 - v),
                0,
                0,
            ],
            [
                0.272 - 0.272 * (1 - v),
                0.534 - 0.534 * (1 - v),
                0.131 + 0.869 * (1 - v),
                0,
                0,
            ],
            [0, 0, 0, 1, 0],
            [0, 0, 0, 0, 1],
        ];
    },

    /**
     * 灰度矩阵
     * @param v
     * @returns
     */
    grayscale(v: number): matrix5x5 {
        return [
            [
                0.2126 + 0.7874 * (1 - v),
                0.7152 - 0.7152 * (1 - v),
                0.0722 - 0.0722 * (1 - v),
                0,
                0,
            ],
            [
                0.2126 - 0.2126 * (1 - v),
                0.7152 + 0.2848 * (1 - v),
                0.0722 - 0.0722 * (1 - v),
                0,
                0,
            ],
            [
                0.2126 - 0.2126 * (1 - v),
                0.7152 - 0.7152 * (1 - v),
                0.0722 + 0.9278 * (1 - v),
                0,
                0,
            ],
            [0, 0, 0, 1, 0],
            [0, 0, 0, 0, 1],
        ];
    },
};
