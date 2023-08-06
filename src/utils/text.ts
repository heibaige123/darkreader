/**
 * 返回字符串中指定索引位置的消息，包括行数和列数。它还提供一个指示字符来明确显示错误的位置
 * @param text 
 * @param index 
 * @returns 
 */
export function getTextPositionMessage(text: string, index: number): string {
    if (!isFinite(index)) {
        throw new Error(`Wrong char index ${index}`);
    }
    let message = '';
    let line = 0;
    let prevLn: number;
    let nextLn = 0;
    do {
        line++;
        prevLn = nextLn;
        nextLn = text.indexOf('\n', prevLn + 1);
    } while (nextLn >= 0 && nextLn <= index);
    const column = index - prevLn;
    message += `line ${line}, column ${column}`;
    message += '\n';
    if (index < text.length) {
        message += text.substring(prevLn + 1, nextLn);
    } else {
        message += text.substring(text.lastIndexOf('\n') + 1);
    }
    message += '\n';
    message += `${new Array(column).join('-')}^`;
    return message;
}

/**
 * 一个比较两个字符串并返回第一个不同字符的索引的函数。
 * @param text 
 * @param index 
 * @returns 
 */
export function getTextDiffIndex(a: string, b: string): number {
    const short = Math.min(a.length, b.length);
    for (let i = 0; i < short; i++) {
        if (a[i] !== b[i]) {
            return i;
        }
    }
    if (a.length !== b.length) {
        return short;
    }
    return -1;
}

/**
 * 一个字符串转换为字符串数组，其中每一行变成数组的一个元素。
 * @param text 
 * @param index 
 * @returns 
 */
export function parseArray(text: string): string[] {
    return text
        .replace(/\r/g, '')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s);
}

/**
 * 将字符串数组转换回为一个单独的字符串。
 * @param text 
 * @param index 
 * @returns 
 */
export function formatArray(arr: Readonly<string[]>): string {
    return arr.concat('').join('\n');
}

/**
 * 使用正则表达式从输入的字符串中捕获并返回所有匹配项。
 * @param text 
 * @param index 
 * @returns 
 */
export function getMatches(regex: RegExp, input: string, group = 0): string[] {
    const matches: string[] = [];
    let m: RegExpMatchArray | null;
    while ((m = regex.exec(input))) {
        matches.push(m[group]);
    }
    return matches;
}

/**
 * 返回字符串的大小。此处的大小是基于每个字符占用2个字节来计算的。
 * @param text 
 * @param index 
 * @returns 
 */
export function getStringSize(value: string): number {
    return value.length * 2;
}

/**
 * 格式化CSS代码，使其具有恰当的缩进和新行。此函数特别处理了多余的空格、括号和其他CSS特有的格式问题。
 * @param text 
 * @param index 
 * @returns 
 */
export function formatCSS(text: string): string {
    function trimLeft(text: string) {
        return text.replace(/^\s+/, '');
    }

    function getIndent(depth: number) {
        if (depth === 0) {
            return '';
        }
        return ' '.repeat(4 * depth);
    }

    // Dont execute this kind of Regex on large CSS, as this isn't necessary.
    // Maxium of 50K characters.
    if (text.length < 50000) {
        const emptyRuleRegexp = /[^{}]+{\s*}/;
        while (emptyRuleRegexp.test(text)) {
            text = text.replace(emptyRuleRegexp, '');
        }
    }
    const css = text
        .replace(/\s{2,}/g, ' ') // Replacing multiple spaces to one
        .replace(/\{/g, '{\n') // {
        .replace(/\}/g, '\n}\n') // }
        .replace(/\;(?![^\(|\"]*(\)|\"))/g, ';\n') // ; and do not target between () and ""
        .replace(/\,(?![^\(|\"]*(\)|\"))/g, ',\n') // , and do not target between () and ""
        .replace(/\n\s*\n/g, '\n') // Remove \n Without any characters between it to the next \n
        .split('\n');

    let depth = 0;
    const formatted: string[] = [];

    for (let x = 0, len = css.length; x < len; x++) {
        const line = `${css[x]}\n`;
        if (line.includes('{')) {
            // {
            formatted.push(getIndent(depth++) + trimLeft(line));
        } else if (line.includes('}')) {
            // }
            formatted.push(getIndent(--depth) + trimLeft(line));
        } else {
            // CSS line
            formatted.push(getIndent(depth) + trimLeft(line));
        }
    }

    return formatted.join('').trim();
}

/**
 * 这是一个接口，定义了一对括号的开始和结束索引。
 */
interface ParenthesesRange {
    start: number;
    end: number;
}

/**
 * 返回输入字符串中从指定开始索引处的第一对完整的括号的范围。
 * @param text 
 * @param index 
 * @returns 
 */
export function getParenthesesRange(
    input: string,
    searchStartIndex = 0,
): ParenthesesRange | null {
    const length = input.length;
    let depth = 0;
    let firstOpenIndex = -1;
    for (let i = searchStartIndex; i < length; i++) {
        if (depth === 0) {
            const openIndex = input.indexOf('(', i);
            if (openIndex < 0) {
                break;
            }
            firstOpenIndex = openIndex;
            depth++;
            i = openIndex;
        } else {
            const closingIndex = input.indexOf(')', i);
            if (closingIndex < 0) {
                break;
            }
            const openIndex = input.indexOf('(', i);
            if (openIndex < 0 || closingIndex < openIndex) {
                depth--;
                if (depth === 0) {
                    return { start: firstOpenIndex, end: closingIndex + 1 };
                }
                i = closingIndex;
            } else {
                depth++;
                i = openIndex;
            }
        }
    }
    return null;
}
