/**
 * Minimal LaTeX math-mode tokenizer, purpose-built for maxima.ts.
 *
 * This intentionally does not aim to be a general LaTeX parser (no
 * \makeatletter, no bibliography/document macros, no custom macro
 * definitions) - it only produces the small set of node shapes that
 * maxima.ts's tree-walker consumes: string, whitespace, macro, group and
 * environment. Replaces @unified-latex, which pulled in a ~250KB (minified)
 * dependency to parse a subset of LaTeX this plugin never needed.
 */

export interface StringNode {
    type: "string";
    content: string;
}

export interface Whitespace {
    type: "whitespace";
}

export interface Argument {
    content: LatexNode[];
}

export interface Macro {
    type: "macro";
    content: string;
    args?: Argument[];
}

export interface Group {
    type: "group";
    content: LatexNode[];
}

export interface Environment {
    type: "environment";
    env: string;
    content: LatexNode[];
}

export type LatexNode = StringNode | Whitespace | Macro | Group | Environment;

const LETTER = /[a-zA-Z]/;
const WHITESPACE = /[ \t\n\r]/;

class Parser {
    private readonly src: string;
    private pos = 0;

    constructor(src: string) {
        this.src = src;
    }

    private peek(offset = 0): string | undefined {
        return this.src[this.pos + offset];
    }

    private atEnd(): boolean {
        return this.pos >= this.src.length;
    }

    /** Parses a sequence of nodes until end-of-input or a stop character (e.g. an unmatched `}`). */
    parseSequence(stopChars: string): LatexNode[] {
        const nodes: LatexNode[] = [];
        while (!this.atEnd() && !stopChars.includes(this.peek() as string)) {
            if (this.tryParseEnd()) break;
            nodes.push(this.parseOne());
        }
        return nodes;
    }

    /** True if the upcoming input is `\end{...}` (used to stop an environment body without consuming it). */
    private tryParseEnd(): boolean {
        return this.peek() === "\\" && this.src.startsWith("\\end{", this.pos);
    }

    private parseOne(): LatexNode {
        const ch = this.peek() as string;

        if (WHITESPACE.test(ch)) {
            while (!this.atEnd() && WHITESPACE.test(this.peek() as string)) this.pos++;
            return { type: "whitespace" };
        }

        if (ch === "{") {
            this.pos++;
            const content = this.parseSequence("}");
            if (this.peek() === "}") this.pos++;
            return { type: "group", content };
        }

        if (ch === "\\") {
            return this.parseMacroOrEnvironment();
        }

        // `_` and `^` are standalone special characters in math mode (no
        // leading backslash), but behave like a macro taking one argument.
        if (ch === "_" || ch === "^") {
            this.pos++;
            return this.parseMacroArgs(ch);
        }

        this.pos++;
        return { type: "string", content: ch };
    }

    private parseMacroOrEnvironment(): LatexNode {
        this.pos++; // consume '\'
        let name: string;
        if (LETTER.test(this.peek() ?? "")) {
            let start = this.pos;
            while (!this.atEnd() && LETTER.test(this.peek() as string)) this.pos++;
            name = this.src.slice(start, this.pos);
        } else {
            name = this.peek() ?? "";
            this.pos++;
        }

        if (name === "begin") return this.parseEnvironment();
        return this.parseMacroArgs(name);
    }

    private parseEnvironment(): Environment {
        this.skipWhitespace();
        const envName = this.parseBracedText();
        const content = this.parseSequence("");
        // Consume the matching \end{envName} (already verified present by tryParseEnd()).
        if (this.src.startsWith("\\end{", this.pos)) {
            this.pos += "\\end{".length;
            while (!this.atEnd() && this.peek() !== "}") this.pos++;
            if (this.peek() === "}") this.pos++;
        }
        return { type: "environment", env: envName, content };
    }

    /** Reads a `{...}` group and flattens its string-node contents into plain text (for environment names). */
    private parseBracedText(): string {
        if (this.peek() !== "{") return "";
        this.pos++;
        let text = "";
        while (!this.atEnd() && this.peek() !== "}") {
            text += this.peek();
            this.pos++;
        }
        if (this.peek() === "}") this.pos++;
        return text;
    }

    private skipWhitespace(): void {
        while (!this.atEnd() && WHITESPACE.test(this.peek() as string)) this.pos++;
    }

    private parseMacroArgs(name: string): Macro {
        if (name === "frac") {
            const a = this.parseRequiredGroupArg();
            const b = this.parseRequiredGroupArg();
            return { type: "macro", content: name, args: [a, b] };
        }
        if (name === "sqrt") {
            const degree = this.parseOptionalBracketArg();
            const radicand = this.parseRequiredGroupArg();
            return { type: "macro", content: name, args: [degree, radicand] };
        }
        if (name === "^" || name === "_") {
            const arg = this.parseSingleAtomArg();
            return { type: "macro", content: name, args: [arg] };
        }
        return { type: "macro", content: name };
    }

    private parseRequiredGroupArg(): Argument {
        this.skipWhitespace();
        if (this.peek() === "{") {
            this.pos++;
            const content = this.parseSequence("}");
            if (this.peek() === "}") this.pos++;
            return { content };
        }
        // Tolerate a missing brace by taking the next single atom.
        return this.parseSingleAtomArg();
    }

    private parseOptionalBracketArg(): Argument {
        if (this.peek() === "[") {
            this.pos++;
            const content = this.parseSequence("]");
            if (this.peek() === "]") this.pos++;
            return { content };
        }
        return { content: [] };
    }

    private parseSingleAtomArg(): Argument {
        if (this.atEnd()) return { content: [] };
        if (this.peek() === "{") {
            this.pos++;
            const content = this.parseSequence("}");
            if (this.peek() === "}") this.pos++;
            return { content };
        }
        return { content: [this.parseOne()] };
    }
}

export function parseMath(input: string): LatexNode[] {
    return new Parser(input).parseSequence("");
}
