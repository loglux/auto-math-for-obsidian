/**
 * Remove zero-width characters that break trigger matching
 */
export function normalizeText(s: string | null | undefined): string {
    return (s ?? "").replace(/[\u200B\uFEFF]/g, "");
}

/**
 * Index of the "{" matching the "}" at `closeIdx`, scanning backwards, or -1.
 * Nested braces are balanced, so "x^{2}+1" is one group.
 */
function matchingOpenBrace(s: string, closeIdx: number): number {
    let depth = 0;
    for (let i = closeIdx; i >= 0; i--) {
        if (s[i] === "}") depth++;
        else if (s[i] === "{") {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/**
 * Parse a trailing \polylongdiv{dividend}{divisor} at the end of `text`.
 * Returns the whole matched call and both arguments, or null.
 */
export function parsePolyLongDivCall(text: string): { full: string; dividend: string; divisor: string } | null {
    if (!text.endsWith("}")) return null;

    const divisorOpen = matchingOpenBrace(text, text.length - 1);
    if (divisorOpen < 1 || text[divisorOpen - 1] !== "}") return null;

    const dividendOpen = matchingOpenBrace(text, divisorOpen - 1);
    if (dividendOpen < 0) return null;

    const command = "\\polylongdiv";
    const start = dividendOpen - command.length;
    if (start < 0 || text.slice(start, dividendOpen) !== command) return null;

    return {
        full: text.slice(start),
        dividend: text.slice(dividendOpen + 1, divisorOpen - 1),
        divisor: text.slice(divisorOpen + 1, text.length - 1),
    };
}
