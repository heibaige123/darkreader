
/**
 * 要忽略变更的dom节点
 * @param element
 * @returns
 */
export function isIgnoreBoxInner(element: Element, ignoreSelectArr: string[] = []) {
    while (element && element !== document.body) {
        if (!element || !element.matches) {
            return false;
        }

        for (let index = 0, len = ignoreSelectArr.length; index < len; index++) {
            const selector = ignoreSelectArr[index];
            if (element.matches(selector)) {
                return true;
            }
        }

        element = element.parentNode as Element;
    }

    return false;
}