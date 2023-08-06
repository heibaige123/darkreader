// evalMath is a function that's able to evaluates a mathematical expression and return it's ouput.
//
// Internally it uses the Shunting Yard algoritm. First it produces a reverse polish notation(RPN) stack.
// Example: 1 + 2 * 3 -> [1, 2, 3, *, +] which with parentheses means 1 (2 3 *) +
//
// Then it evaluates the RPN stack and returns the output.
/**
 * 使用“调度场算法”（Shunting Yard Algorithm）来处理数学表达式
 * 逆波兰表示法
 * @param expression 
 * @returns 
 */
export function evalMath(expression: string): number {
    // Stack where operators & numbers are stored in RPN.
    const rpnStack: string[] = [];
    // The working stack where new tokens are pushed.
    const workingStack: string[] = [];

    let lastToken: string | undefined;
    // Iterate over the expression.
    for (let i = 0, len = expression.length; i < len; i++) {
        const token = expression[i];

        // Skip if the token is empty or a whitespace.
        if (!token || token === ' ') {
            continue;
        }

        // Is the token a operator?
        if (operators.has(token)) {
            const op = operators.get(token);

            // Go trough the workingstack and determine it's place in the workingStack
            while (workingStack.length) {
                const currentOp = operators.get(workingStack[0]);
                if (!currentOp) {
                    break;
                }

                // Is the current operation equal or less than the current operation?
                // Then move that operation to the rpnStack.
                if (op!.lessOrEqualThan(currentOp)) {
                    rpnStack.push(workingStack.shift()!);
                } else {
                    break;
                }
            }
            // Add the operation to the workingStack.
            workingStack.unshift(token);
            // Otherwise was the last token a operator?
        } else if (!lastToken || operators.has(lastToken)) {
            rpnStack.push(token);
            // Otherwise just append the result to the last token(e.g. multiple digits numbers).
        } else {
            rpnStack[rpnStack.length - 1] += token;
        }
        // Set the last token.
        lastToken = token;
    }

    // Push the working stack on top of the rpnStack.
    rpnStack.push(...workingStack);

    // Now evaluate the rpnStack.
    const stack: number[] = [];
    for (let i = 0, len = rpnStack.length; i < len; i++) {
        const op = operators.get(rpnStack[i]);
        if (op) {
            // Get the arguments of for the operation(first two in the stack).
            const args = stack.splice(0, 2);
            // Excute it, because of reverse notation we first pass second item then the first item.
            stack.push(op.exec(args[1], args[0]));
        } else {
            // Add the number to the stack.
            stack.unshift(parseFloat(rpnStack[i]));
        }
    }

    return stack[0];
}

// Operator class  defines a operator that can be parsed & evaluated by evalMath.
/**
 * 操作符
 */
class Operator {
    private precendce: number;
    private execMethod: (left: number, right: number) => number;

    public constructor(
        precedence: number,
        method: (left: number, right: number) => number,
    ) {
        this.precendce = precedence;
        this.execMethod = method;
    }

    /**
     * 执行操作
     * @param left 
     * @param right 
     * @returns 
     */
    public exec(left: number, right: number): number {
        return this.execMethod(left, right);
    }

    /**
     * 比较两个操作符的优先级
     * @param op 
     * @returns 
     */
    public lessOrEqualThan(op: Operator) {
        return this.precendce <= op.precendce;
    }
}

/**
 * 一个只读的映射，其中的键是操作符字符串（如"+"或"*"），值是对应的Operator对象。
 * 定义了四个基本的数学操作：加、减、乘、除，并为每个操作设置了一个优先级。
 */
const operators: Readonly<Map<string, Operator>> = new Map([
    [
        '+',
        new Operator(1, (left: number, right: number): number => left + right),
    ],
    [
        '-',
        new Operator(1, (left: number, right: number): number => left - right),
    ],
    [
        '*',
        new Operator(2, (left: number, right: number): number => left * right),
    ],
    [
        '/',
        new Operator(2, (left: number, right: number): number => left / right),
    ],
]);
