import { describe, expect, it } from "vitest";
import { normalizeText } from "../src/utils";

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
