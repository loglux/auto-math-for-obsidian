import { parseMath } from "./latex-parse";
import type { Argument, LatexNode } from "./latex-parse";

/**
 * A converted fragment of Maxima syntax.
 * `compound` marks text that contains a top-level (unparenthesized) + or -,
 * so callers that embed it into a tighter-binding context (division,
 * exponentiation) know to wrap it in parens first.
 */
interface Piece {
    text: string;
    compound: boolean;
}

const SYMBOL_MACROS: Record<string, string> = {
    cdot: "*",
    times: "*",
    div: "/",
    pm: " +- ",
    mp: " -+ ",
    to: " -> ",
    infty: "inf",
    pi: "%pi",
    ldots: "...",
    cdots: "...",
    quad: " ",
    qquad: "  ",
};

// Macros that render as nothing on their own - grouping/spacing hints whose
// real effect (parens, thin space) is already carried by neighbouring nodes.
const IGNORED_MACROS = new Set(["left", "right", ",", ";", "!", "text"]);

const FUNCTION_MACROS: Record<string, string> = {
    sin: "sin",
    cos: "cos",
    tan: "tan",
    asin: "asin",
    acos: "acos",
    atan: "atan",
    arcsin: "asin",
    arccos: "acos",
    arctan: "atan",
    sinh: "sinh",
    cosh: "cosh",
    tanh: "tanh",
    sec: "sec",
    csc: "csc",
    cot: "cot",
    exp: "exp",
    // Maxima's log() is natural log, matching \ln more closely than LaTeX's
    // \log (conventionally base 10). Documented limitation, not a bug.
    ln: "log",
    log: "log",
};

const BIG_OPERATORS = new Set(["int", "sum", "prod", "lim"]);

const MATRIX_ENVIRONMENTS = new Set(["matrix", "pmatrix", "bmatrix", "vmatrix", "Vmatrix"]);

export function latexToMaxima(input: string): string {
    const stripped = input.trim().replace(/^\${1,2}/, "").replace(/\${1,2}$/, "").trim();
    if (!stripped) return "";
    const nodes = parseMath(stripped);
    return convertNodes(nodes).text.trim();
}

function isString(n: LatexNode | undefined): n is Extract<LatexNode, { type: "string" }> {
    return !!n && n.type === "string";
}

function isDigit(ch: string): boolean {
    return ch.length === 1 && ch >= "0" && ch <= "9";
}

function wrapIfCompound(p: Piece): string {
    return p.compound ? `(${p.text})` : p.text;
}

function argContent(arg: Argument | undefined): LatexNode[] {
    return arg?.content ?? [];
}

/** Finds the index of the closing delimiter matching an opener at `openIdx`, or -1. */
function findMatchingDelimiter(nodes: LatexNode[], openIdx: number, open: string, close: string): number {
    if (open === close) {
        for (let i = openIdx + 1; i < nodes.length; i++) {
            const n = nodes[i];
            if (isString(n) && n.content === close) return i;
        }
        return -1;
    }
    let depth = 0;
    for (let i = openIdx; i < nodes.length; i++) {
        const n = nodes[i];
        if (isString(n) && n.content === open) depth++;
        else if (isString(n) && n.content === close) {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/** Merges a run of digit (and optional decimal point) string nodes starting at `i`. */
function readNumber(nodes: LatexNode[], i: number): { text: string; next: number } {
    let text = "";
    let j = i;
    while (j < nodes.length && isString(nodes[j]) && isDigit((nodes[j] as { content: string }).content)) {
        text += (nodes[j] as { content: string }).content;
        j++;
    }
    if (
        isString(nodes[j]) &&
        (nodes[j] as { content: string }).content === "." &&
        isString(nodes[j + 1]) &&
        isDigit((nodes[j + 1] as { content: string }).content)
    ) {
        text += ".";
        j++;
        while (j < nodes.length && isString(nodes[j]) && isDigit((nodes[j] as { content: string }).content)) {
            text += (nodes[j] as { content: string }).content;
            j++;
        }
    }
    return { text, next: j };
}

/**
 * Consumes the single factor immediately following a bare function-name
 * macro (e.g. the `x` in `\sin x`, since \sin has no formal LaTeX argument).
 */
function readSingleFactor(nodes: LatexNode[], i: number): { piece: Piece; next: number } {
    let j = i;
    while (j < nodes.length && nodes[j].type === "whitespace") j++;
    if (j >= nodes.length) return { piece: { text: "", compound: false }, next: j };

    const n = nodes[j];
    if (n.type === "group") {
        return { piece: convertNodes(n.content), next: j + 1 };
    }
    if (isString(n) && n.content === "(") {
        const closeIdx = findMatchingDelimiter(nodes, j, "(", ")");
        if (closeIdx !== -1) {
            return { piece: convertNodes(nodes.slice(j + 1, closeIdx)), next: closeIdx + 1 };
        }
    }
    if (isString(n) && isDigit(n.content)) {
        const { text, next } = readNumber(nodes, j);
        return { piece: { text, compound: false }, next };
    }
    return { piece: convertNodes([n]), next: j + 1 };
}

/** Handles \int, \sum, \prod, \lim: consumes optional _{}/^{} bounds, then the rest of the list as the body. */
function convertBigOperator(name: string, nodes: LatexNode[], i: number): Piece {
    const prefix = convertNodes(nodes.slice(0, i));

    let j = i + 1;
    let lower: Piece | null = null;
    let upper: Piece | null = null;
    while (j < nodes.length && nodes[j].type === "whitespace") j++;
    if (nodes[j] && nodes[j].type === "macro" && (nodes[j] as { content: string }).content === "_") {
        lower = convertNodes(argContent((nodes[j] as { args?: Argument[] }).args?.[0]));
        j++;
        while (j < nodes.length && nodes[j].type === "whitespace") j++;
    }
    if (nodes[j] && nodes[j].type === "macro" && (nodes[j] as { content: string }).content === "^") {
        upper = convertNodes(argContent((nodes[j] as { args?: Argument[] }).args?.[0]));
        j++;
    }

    let bodyNodes = nodes.slice(j);
    let variable = "x";

    if (name === "int") {
        // Strip a trailing "d<var>" marker (e.g. the "dx" in "x^2\,dx").
        let end = bodyNodes.length;
        while (end > 0 && bodyNodes[end - 1].type === "whitespace") end--;
        if (
            end >= 2 &&
            isString(bodyNodes[end - 1]) &&
            /^[a-zA-Z]$/.test((bodyNodes[end - 1] as { content: string }).content) &&
            isString(bodyNodes[end - 2]) &&
            (bodyNodes[end - 2] as { content: string }).content === "d"
        ) {
            variable = (bodyNodes[end - 1] as { content: string }).content;
            let trimEnd = end - 2;
            // Drop a preceding thin-space/comma macro (\,) if present.
            while (trimEnd > 0 && bodyNodes[trimEnd - 1].type === "whitespace") trimEnd--;
            bodyNodes = bodyNodes.slice(0, trimEnd);
        }
    } else if (name === "sum" || name === "prod") {
        // Bound looks like "i=1": the variable is everything before the "=".
        if (lower) {
            const eq = lower.text.indexOf("=");
            if (eq !== -1) {
                variable = lower.text.slice(0, eq).trim() || variable;
                lower = { text: lower.text.slice(eq + 1).trim(), compound: false };
            }
        }
    } else if (name === "lim") {
        if (lower) {
            const arrow = lower.text.indexOf("->");
            if (arrow !== -1) {
                variable = lower.text.slice(0, arrow).trim() || variable;
                lower = { text: lower.text.slice(arrow + 2).trim(), compound: false };
            }
        }
    }

    const body = convertNodes(bodyNodes);
    let call: string;
    if (name === "int") {
        call =
            lower && upper
                ? `integrate(${body.text}, ${variable}, ${lower.text}, ${upper.text})`
                : `integrate(${body.text}, ${variable})`;
    } else if (name === "sum") {
        call = `sum(${body.text}, ${variable}, ${lower ? lower.text : "1"}, ${upper ? upper.text : "n"})`;
    } else if (name === "prod") {
        call = `product(${body.text}, ${variable}, ${lower ? lower.text : "1"}, ${upper ? upper.text : "n"})`;
    } else {
        call = `limit(${body.text}, ${variable}, ${lower ? lower.text : "0"})`;
    }

    const prefixText = prefix.text ? `${wrapIfCompound(prefix)}*` : "";
    return { text: `${prefixText}${call}`, compound: false };
}

function convertMatrixEnvironment(env: { env: string; content: LatexNode[] }): string {
    const rows: LatexNode[][] = [[]];
    for (const n of env.content) {
        if (n.type === "macro" && n.content === "\\") {
            rows.push([]);
        } else {
            rows[rows.length - 1].push(n);
        }
    }
    const rowStrings = rows
        .filter((row) => row.some((n) => n.type !== "whitespace"))
        .map((row) => {
            const cells: LatexNode[][] = [[]];
            for (const n of row) {
                if (isString(n) && n.content === "&") cells.push([]);
                else cells[cells.length - 1].push(n);
            }
            return `[${cells.map((cell) => convertNodes(cell).text).join(", ")}]`;
        });
    return `matrix(${rowStrings.join(", ")})`;
}

function convertOperatorString(content: string): Piece {
    if (content === "+" || content === "-" || content === "=" || content === "<" || content === ">") {
        return { text: ` ${content} `, compound: content === "+" || content === "-" };
    }
    return { text: content, compound: false };
}

/** Combines a base piece with a following ^ or _ macro. */
function applySuperSubscript(base: Piece | undefined, macroName: string, exponent: Piece): Piece {
    const baseText = base ? wrapIfCompound(base) : "";
    if (macroName === "^") {
        return { text: `${baseText}^${wrapIfCompound(exponent)}`, compound: false };
    }
    // Subscript: identifier-style concatenation (valid Maxima identifiers may
    // contain underscores), e.g. x_1 -> x_1, a_{n+1} -> a_(n+1).
    const subText = exponent.compound || /\s/.test(exponent.text) ? `(${exponent.text})` : exponent.text;
    return { text: `${baseText}_${subText}`, compound: false };
}

function convertMacro(n: { content: string; args?: Argument[] }): Piece | null {
    const name = n.content;

    if (IGNORED_MACROS.has(name)) return { text: "", compound: false };
    if (name in SYMBOL_MACROS) return { text: SYMBOL_MACROS[name], compound: false };

    if (name === "frac") {
        const num = convertNodes(argContent(n.args?.[0]));
        const den = convertNodes(argContent(n.args?.[1]));
        return { text: `${wrapIfCompound(num)}/${wrapIfCompound(den)}`, compound: false };
    }

    if (name === "sqrt") {
        const degreeNodes = argContent(n.args?.[0]);
        const radicand = convertNodes(argContent(n.args?.[1]));
        if (degreeNodes.length > 0) {
            const degree = convertNodes(degreeNodes);
            return { text: `${wrapIfCompound(radicand)}^(1/${wrapIfCompound(degree)})`, compound: false };
        }
        return { text: `sqrt(${radicand.text})`, compound: false };
    }

    if (name in FUNCTION_MACROS && n.args && n.args.length > 0 && n.args[0].content.length > 0) {
        const arg = convertNodes(argContent(n.args[0]));
        return { text: `${FUNCTION_MACROS[name]}(${arg.text})`, compound: false };
    }

    return null;
}

function convertNodes(nodes: LatexNode[]): Piece {
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.type === "macro" && BIG_OPERATORS.has(n.content)) {
            return convertBigOperator(n.content, nodes, i);
        }
    }

    const tokens: Piece[] = [];
    let i = 0;
    while (i < nodes.length) {
        const n = nodes[i];

        if (n.type === "whitespace") {
            i++;
            continue;
        }

        if (n.type === "macro" && (n.content === "^" || n.content === "_")) {
            const arg = convertNodes(argContent(n.args?.[0]));
            tokens.push(applySuperSubscript(tokens.pop(), n.content, arg));
            i++;
            continue;
        }

        if (n.type === "macro" && FUNCTION_MACROS[n.content] && (!n.args || n.args.length === 0)) {
            const { piece, next } = readSingleFactor(nodes, i + 1);
            tokens.push({ text: `${FUNCTION_MACROS[n.content]}(${piece.text})`, compound: false });
            i = next;
            continue;
        }

        if (n.type === "macro") {
            const piece = convertMacro(n);
            if (piece) {
                tokens.push(piece);
                i++;
                continue;
            }
            // Unrecognised macro: fall back to its bare name so output stays
            // readable instead of silently dropping content.
            tokens.push({ text: n.content, compound: false });
            i++;
            continue;
        }

        if (isString(n) && n.content === "(") {
            const closeIdx = findMatchingDelimiter(nodes, i, "(", ")");
            if (closeIdx !== -1) {
                const inner = convertNodes(nodes.slice(i + 1, closeIdx));
                tokens.push({ text: `(${inner.text})`, compound: false });
                i = closeIdx + 1;
                continue;
            }
        }

        if (isString(n) && n.content === "|") {
            const closeIdx = findMatchingDelimiter(nodes, i, "|", "|");
            if (closeIdx !== -1) {
                const inner = convertNodes(nodes.slice(i + 1, closeIdx));
                tokens.push({ text: `abs(${inner.text})`, compound: false });
                i = closeIdx + 1;
                continue;
            }
        }

        if (isString(n) && isDigit(n.content)) {
            const { text, next } = readNumber(nodes, i);
            tokens.push({ text, compound: false });
            i = next;
            continue;
        }

        if (n.type === "group") {
            const inner = convertNodes(n.content);
            tokens.push({ text: wrapIfCompound(inner), compound: false });
            i++;
            continue;
        }

        if (n.type === "environment" && MATRIX_ENVIRONMENTS.has(n.env)) {
            tokens.push({ text: convertMatrixEnvironment(n), compound: false });
            i++;
            continue;
        }

        if (isString(n)) {
            if ((n.content === "+" || n.content === "-") && tokens.length === 0) {
                // Unary sign at the start of an expression/argument: no
                // surrounding spaces (e.g. "-b", not "- b").
                tokens.push({ text: n.content, compound: true });
            } else {
                tokens.push(convertOperatorString(n.content));
            }
            i++;
            continue;
        }

        i++;
    }

    return joinTokens(tokens);
}

const OPERAND_END = /[)\w.]$/;
const OPERAND_START = /^[(\w]/;

function joinTokens(tokens: Piece[]): Piece {
    let text = "";
    let compound = false;
    for (let k = 0; k < tokens.length; k++) {
        const t = tokens[k];
        if (
            k > 0 &&
            OPERAND_END.test(text.trimEnd()) &&
            OPERAND_START.test(t.text) &&
            !/\s$/.test(text) // an already-spaced operator (e.g. " + ") needs no extra "*"
        ) {
            text += "*";
        }
        text += t.text;
    }
    // Any multi-token join (implicit "*" included) needs parens before it can
    // be safely embedded in a tighter-binding context (division, exponent).
    if (tokens.length > 1) compound = true;
    return { text: text.trim(), compound };
}
