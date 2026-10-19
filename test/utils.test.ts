import { describe, expect, it } from "vitest";
import { normalizeText, parsePolyLongDivCall } from "../src/utils";

describe("normalizeText", () => {
    it("strips zero-width spaces", () => {
        expect(normalizeText("\\fr\u200Bac")).toBe("\\frac");
    });

    it("strips BOM characters", () => {
        expect(normalizeText("\uFEFF\\frac")).toBe("\\frac");
    });

    it("leaves ordinary text untouched", () => {
        expect(normalizeText("\\frac{}{}")).toBe("\\frac{}{}");
    });

    it("treats null and undefined as empty string", () => {
        expect(normalizeText(null)).toBe("");
        expect(normalizeText(undefined)).toBe("");
    });
});

describe("parsePolyLongDivCall", () => {
    it("parses plain arguments", () => {
        expect(parsePolyLongDivCall("a \\polylongdiv{x+1}{x-1}")).toEqual({
            full: "\\polylongdiv{x+1}{x-1}",
            dividend: "x+1",
            divisor: "x-1",
        });
    });

    it("parses arguments with nested braces", () => {
        const r = parsePolyLongDivCall("\\polylongdiv{x^{2}+1}{x-1}");
        expect(r?.dividend).toBe("x^{2}+1");
        expect(r?.divisor).toBe("x-1");
    });

    it("rejects incomplete or unrelated input", () => {
        expect(parsePolyLongDivCall("\\polylongdiv{x^{2}+1}")).toBeNull();
        expect(parsePolyLongDivCall("\\frac{x}{y}")).toBeNull();
        expect(parsePolyLongDivCall("\\polylongdiv{x}{y")).toBeNull();
    });
});
