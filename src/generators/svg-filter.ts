import { createFilterMatrix, Matrix } from './utils/matrix';
import { cssFilterStyleSheetTemplate } from './css-filter';
import type { FilterConfig, InversionFix } from '../definitions';
import type { SitePropsIndex } from './utils/parse';

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

function toSVGMatrix(matrix: number[][]): string {
    return matrix
        .slice(0, 4)
        .map((m) => m.map((m) => m.toFixed(3)).join(' '))
        .join(' ');
}

export function getSVGFilterMatrixValue(config: FilterConfig): string {
    return toSVGMatrix(createFilterMatrix(config));
}

export function getSVGReverseFilterMatrixValue(): string {
    return toSVGMatrix(Matrix.invertNHue());
}
