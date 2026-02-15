/**
 * Remove zero-width characters that break trigger matching
 */
export function normalizeText(s: string | null | undefined): string {
    return (s ?? "").replace(/[\u200B\uFEFF]/g, "");
}
