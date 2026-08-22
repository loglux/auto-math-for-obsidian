/**
 * Minimal in-memory stand-in for Obsidian's Editor, covering only the
 * methods AutoMathPlugin's expansion logic calls.
 */
export interface Pos {
    line: number;
    ch: number;
}

export class FakeEditor {
    lines: string[];
    private cursor: Pos;

    constructor(text: string, cursor: Pos) {
        this.lines = text.split("\n");
        this.cursor = cursor;
    }

    getLine(n: number): string {
        return this.lines[n] ?? "";
    }

    setLine(n: number, text: string): void {
        this.lines[n] = text;
    }

    lineCount(): number {
        return this.lines.length;
    }

    getCursor(): Pos {
        return this.cursor;
    }

    setCursor(pos: Pos): void {
        const lineLen = this.lines[pos.line]?.length ?? 0;
        this.cursor = { line: pos.line, ch: pos.ch === Infinity ? lineLen : pos.ch };
    }

    replaceRange(text: string, from: Pos): void {
        const line = this.lines[from.line] ?? "";
        const ch = from.ch === Infinity ? line.length : from.ch;
        const before = line.slice(0, ch);
        const after = line.slice(ch);
        const inserted = (before + text + after).split("\n");
        this.lines.splice(from.line, 1, ...inserted);
    }

    text(): string {
        return this.lines.join("\n");
    }
}
