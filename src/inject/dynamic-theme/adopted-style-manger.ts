import type { Theme } from '../../definitions';
import { createStyleSheetModifier } from './stylesheet-modifier';

/**
 * 对原始样式表和它们的覆盖之间建立一种映射关系，而不会阻止这些样式表被垃圾回收（当它们不再需要时）
 */
const adoptedStyleOverrides = new WeakMap<CSSStyleSheet, CSSStyleSheet>();
/**
 * 跟踪一些特定的样式表，而不会阻止它们被垃圾回收
 */
const overrideList = new WeakSet<CSSStyleSheet>();

/**
 * 定义了如何对adopted样式表进行渲染和销毁的方法
 */
export interface AdoptedStyleSheetManager {
    render(theme: Theme, ignoreImageAnalysis: string[]): void;
    destroy(): void;
}

/**
 * 接收一个Document或ShadowRoot节点，并返回一个实现AdoptedStyleSheetManager接口的对象
 */
export function createAdoptedStyleSheetOverride(
    node: Document | ShadowRoot,
): AdoptedStyleSheetManager {
    let cancelAsyncOperations = false;

    /**
     * 在给定的原始样式表后插入覆盖样式表
     * @param sheet
     * @param override
     * @returns
     */
    function injectSheet(sheet: CSSStyleSheet, override: CSSStyleSheet) {
        const newSheets = [...node.adoptedStyleSheets];
        const sheetIndex = newSheets.indexOf(sheet);
        const existingIndex = newSheets.indexOf(override);
        if (sheetIndex === existingIndex - 1) {
            return;
        }
        if (existingIndex >= 0) {
            newSheets.splice(existingIndex, 1);
        }
        newSheets.splice(sheetIndex + 1, 0, override);
        node.adoptedStyleSheets = newSheets;
    }

    /**
     * 销毁所有的覆盖，并从节点的adoptedStyleSheets中移除它们
     */
    function destroy() {
        cancelAsyncOperations = true;
        const newSheets = [...node.adoptedStyleSheets];
        node.adoptedStyleSheets.forEach((adoptedStyleSheet) => {
            if (overrideList.has(adoptedStyleSheet)) {
                const existingIndex = newSheets.indexOf(adoptedStyleSheet);
                if (existingIndex >= 0) {
                    newSheets.splice(existingIndex, 1);
                }
                adoptedStyleOverrides.delete(adoptedStyleSheet);
                overrideList.delete(adoptedStyleSheet);
            }
        });
        node.adoptedStyleSheets = newSheets;
    }

    /**
     * 根据给定的主题和其他参数，对所有在节点上被接受的样式表进行渲染
     * @param theme
     * @param ignoreImageAnalysis
     */
    function render(theme: Theme, ignoreImageAnalysis: string[]) {
        node.adoptedStyleSheets.forEach((sheet) => {
            if (overrideList.has(sheet)) {
                return;
            }
            const rules = sheet.rules;
            const override = new CSSStyleSheet();

            /**
             * 准备一个覆盖样式表，删除其上的所有规则，并将其插入到对应的原始样式表后面
             * @returns
             */
            function prepareOverridesSheet() {
                for (let i = override.cssRules.length - 1; i >= 0; i--) {
                    override.deleteRule(i);
                }
                injectSheet(sheet, override);
                adoptedStyleOverrides.set(sheet, override);
                overrideList.add(override);
                return override;
            }

            const sheetModifier = createStyleSheetModifier();
            sheetModifier.modifySheet({
                prepareSheet: prepareOverridesSheet,
                sourceCSSRules: rules,
                theme,
                ignoreImageAnalysis,
                force: false,
                isAsyncCancelled: () => cancelAsyncOperations,
            });
        });
    }

    return {
        render,
        destroy,
    };
}
