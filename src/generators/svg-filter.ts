import { createFilterMatrix, Matrix } from './utils/matrix';
import { cssFilterStyleSheetTemplate } from './css-filter';
import type { FilterConfig, InversionFix } from '../definitions';
import type { SitePropsIndex } from './utils/parse';

/**
 * 根据传入的配置 config，URL url，是否为顶层框架 isTopFrame，修复样式 fixes，
 * 以及站点属性索引 index，生成一个 SVG 滤镜样式表并返回。
 * 它使用 cssFilterStyleSheetTemplate 函数，为
 * 滤镜样式表提供两个值：filterValue 和 reverseFilterValue。
 * 具体值取决于是否为 Chrome 浏览器，因为 Chrome 浏览器在加载外部 URL 时有一些限制。
 * @param config 
 * @param url 
 * @param isTopFrame 
 * @param fixes 
 * @param index 
 * @returns 
 */
export function createSVGFilterStylesheet(
    config: FilterConfig,
    url: string,
    isTopFrame: boolean,
    fixes: string,
    index: SitePropsIndex<InversionFix>,
): string {
    let filterValue: string;
    let reverseFilterValue: string;

        // Chrome fails with "Unsafe attempt to load URL ... Domains, protocols and ports must match.
        filterValue = 'url(#dark-reader-filter)';
        reverseFilterValue = 'url(#dark-reader-reverse-filter)';
    return cssFilterStyleSheetTemplate(
        filterValue,
        reverseFilterValue,
        config,
        url,
        isTopFrame,
        fixes,
        index,
    );
}

/**
 * 用于将一个二维数组表示的矩阵转换为 SVG 中所需的格式。
 * 它将矩阵中的每个值保留 3 位小数，并将矩阵中的每一行连接成一个字符串。
 * @param matrix 
 * @returns 
 */
function toSVGMatrix(matrix: number[][]): string {
    return matrix
        .slice(0, 4)
        .map((m) => m.map((m) => m.toFixed(3)).join(' '))
        .join(' ');
}

/**
 * 根据传入的配置 config，生成对应的 SVG 滤镜矩阵值。
 * @param config 
 * @returns 
 */
export function getSVGFilterMatrixValue(config: FilterConfig): string {
    return toSVGMatrix(createFilterMatrix(config));
}

/**
 * 返回 SVG 滤镜的反向矩阵值
 * @returns 
 */
export function getSVGReverseFilterMatrixValue(): string {
    return toSVGMatrix(Matrix.invertNHue());
}
