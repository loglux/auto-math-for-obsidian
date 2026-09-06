/**
 * Polynomial long division, computed locally (no CAS/network dependency).
 * Parses two single-variable polynomials written as plain LaTeX-ish text
 * (e.g. "x^3+x^2-1"), divides them, and renders the steps as a safe,
 * amsmath-only \begin{array} block - no \enclose/\smash/\cancel, since those
 * extensions aren't guaranteed to be loaded by Obsidian's MathJax config.
 */

export interface ParsedPolynomial {
    /** Coefficients indexed by ascending degree: coeffs[0] is the constant term. */
    coeffs: number[];
    variable: string;
}

export function parsePolynomial(input: string): ParsedPolynomial {
    const s = input.replace(/\s+/g, "");
    if (!s) throw new Error("Empty polynomial");

    let variable = "x";
    const terms: { sign: number; coeff: number; exp: number }[] = [];
    let i = 0;

    while (i < s.length) {
        let sign = 1;
        if (s[i] === "+" || s[i] === "-") {
            sign = s[i] === "-" ? -1 : 1;
            i++;
        } else if (terms.length > 0) {
            throw new Error(`Expected + or - at "${s.slice(i)}"`);
        }

        let numStr = "";
        while (i < s.length && /[0-9.]/.test(s[i])) {
            numStr += s[i];
            i++;
        }

        let hasVar = false;
        let exp = 0;
        if (i < s.length && /[a-zA-Z]/.test(s[i])) {
            variable = s[i];
            hasVar = true;
            i++;
            exp = 1;
            if (s[i] === "^") {
                i++;
                let expStr = "";
                if (s[i] === "{") {
                    i++;
                    while (i < s.length && s[i] !== "}") {
                        expStr += s[i];
                        i++;
                    }
                    if (s[i] === "}") i++;
                } else {
                    while (i < s.length && /[0-9]/.test(s[i])) {
                        expStr += s[i];
                        i++;
                    }
                }
                exp = parseInt(expStr, 10);
                if (Number.isNaN(exp)) throw new Error(`Missing exponent in "${input}"`);
            }
        }

        if (!numStr && !hasVar) {
            throw new Error(`Could not parse term at "${s.slice(i)}" in "${input}"`);
        }

        terms.push({ sign, coeff: numStr ? parseFloat(numStr) : 1, exp });
    }

    const degree = terms.reduce((m, t) => Math.max(m, t.exp), 0);
    const coeffs = new Array<number>(degree + 1).fill(0);
    for (const t of terms) coeffs[t.exp] += t.sign * t.coeff;
    return { coeffs, variable };
}

function formatNumber(n: number): string {
    const rounded = Math.round(n * 1e6) / 1e6;
    return String(rounded);
}

export function formatPolynomial(coeffs: number[], variable: string): string {
    const degree = coeffs.length - 1;
    const parts: { negative: boolean; text: string }[] = [];

    for (let exp = degree; exp >= 0; exp--) {
        const c = coeffs[exp] ?? 0;
        if (Math.abs(c) < 1e-9) continue;

        const abs = Math.abs(c);
        let text: string;
        if (exp === 0) {
            text = formatNumber(abs);
        } else {
            const coeffPart = abs === 1 ? "" : formatNumber(abs);
            const expPart = exp === 1 ? "" : `^${exp}`;
            text = `${coeffPart}${variable}${expPart}`;
        }
        parts.push({ negative: c < 0, text });
    }

    if (parts.length === 0) return "0";

    return parts
        .map((p, idx) => {
            if (idx === 0) return p.negative ? `-${p.text}` : p.text;
            return p.negative ? ` - ${p.text}` : ` + ${p.text}`;
        })
        .join("");
}

export interface DivisionStep {
    /** The term just added to the quotient. */
    quotientTerm: { coeff: number; exp: number };
    /** divisor * quotientTerm, negated and aligned to the dividend's degree - the row subtracted from the running remainder. */
    negatedProduct: number[];
    /** Running remainder after this step. */
    remainderAfter: number[];
}

export interface DivisionResult {
    quotient: number[];
    remainder: number[];
    steps: DivisionStep[];
}

export function polyLongDivide(dividend: number[], divisor: number[]): DivisionResult {
    const divisorDegree = divisor.length - 1;
    if (divisor.every((c) => Math.abs(c) < 1e-9)) {
        throw new Error("Cannot divide by zero polynomial");
    }

    let remainder = dividend.slice();
    const quotient = new Array<number>(Math.max(dividend.length - divisor.length + 1, 0)).fill(0);
    const steps: DivisionStep[] = [];

    for (let guard = 0; guard < dividend.length + 1; guard++) {
        let curDeg = remainder.length - 1;
        while (curDeg > 0 && Math.abs(remainder[curDeg]) < 1e-9) curDeg--;
        if (curDeg < divisorDegree || Math.abs(remainder[curDeg]) < 1e-9) break;

        const factor = remainder[curDeg] / divisor[divisorDegree];
        const shift = curDeg - divisorDegree;
        quotient[shift] = factor;

        const product = new Array<number>(remainder.length).fill(0);
        for (let k = 0; k <= divisorDegree; k++) {
            product[k + shift] += divisor[k] * factor;
        }
        const negatedProduct = product.map((c) => -c);
        const remainderAfter = remainder.map((c, idx) => c + negatedProduct[idx]);

        steps.push({ quotientTerm: { coeff: factor, exp: shift }, negatedProduct, remainderAfter });
        remainder = remainderAfter;
    }

    return { quotient: trimTrailingZeros(quotient), remainder: trimTrailingZeros(remainder), steps };
}

/** Drops trailing (highest-degree) near-zero coefficients, keeping at least one entry. */
function trimTrailingZeros(coeffs: number[]): number[] {
    let end = coeffs.length;
    while (end > 1 && Math.abs(coeffs[end - 1]) < 1e-9) end--;
    return coeffs.slice(0, end);
}

export function computePolyLongDivisionLatex(dividendLatex: string, divisorLatex: string): string {
    const dividend = parsePolynomial(dividendLatex);
    const divisor = parsePolynomial(divisorLatex);
    const variable = dividend.variable;

    const { quotient, remainder, steps } = polyLongDivide(dividend.coeffs, divisor.coeffs);

    let body = "";
    const addRow = (text: string) => {
        body += `${text} \\\\\n`;
    };
    const addHline = () => {
        body += "\\hline\n";
    };

    addRow(
        `\\text{Dividing } ${formatPolynomial(dividend.coeffs, variable)} \\text{ by } ${formatPolynomial(
            divisor.coeffs,
            variable
        )}`
    );
    addHline();
    addRow(formatPolynomial(dividend.coeffs, variable));
    for (const step of steps) {
        addRow(formatPolynomial(step.negatedProduct, variable));
        addHline();
        addRow(formatPolynomial(step.remainderAfter, variable));
    }
    addRow(
        `\\text{Quotient: } ${formatPolynomial(quotient, variable)}, \\quad \\text{Remainder: } ${formatPolynomial(
            remainder,
            variable
        )}`
    );

    return `\\begin{array}{r}\n${body}\\end{array}`;
}
