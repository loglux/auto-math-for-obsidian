import { describe, it, expect } from "vitest";
import { parsePolynomial, formatPolynomial, polyLongDivide, computePolyLongDivisionLatex } from "../src/poly-division";

describe("parsePolynomial", () => {
    it("parses a polynomial with mixed signs", () => {
        expect(parsePolynomial("x^3+x^2-1")).toEqual({ coeffs: [-1, 0, 1, 1], variable: "x" });
    });

    it("parses a simple linear polynomial", () => {
        expect(parsePolynomial("x-1")).toEqual({ coeffs: [-1, 1], variable: "x" });
    });

    it("parses a bare constant", () => {
        expect(parsePolynomial("5")).toEqual({ coeffs: [5], variable: "x" });
    });

    it("parses an implicit coefficient of 1 and 0-degree constant", () => {
        expect(parsePolynomial("-x+3")).toEqual({ coeffs: [3, -1], variable: "x" });
    });
});

describe("formatPolynomial", () => {
    it("formats a polynomial back to LaTeX-ish text", () => {
        expect(formatPolynomial([-1, 0, 1, 1], "x")).toBe("x^3 + x^2 - 1");
    });

    it("formats the zero polynomial", () => {
        expect(formatPolynomial([0], "x")).toBe("0");
    });
});

describe("polyLongDivide", () => {
    it("divides the reference example exactly (x^3+x^2-1) / (x-1)", () => {
        const { quotient, remainder } = polyLongDivide([-1, 0, 1, 1], [-1, 1]);
        expect(quotient).toEqual([2, 2, 1]); // 2 + 2x + x^2
        expect(remainder).toEqual([1]);
    });

    it("divides evenly with zero remainder", () => {
        // x^2 - 1 = (x-1)(x+1)
        const { quotient, remainder } = polyLongDivide([-1, 0, 1], [-1, 1]);
        expect(quotient).toEqual([1, 1]);
        expect(remainder.every((c) => Math.abs(c) < 1e-9)).toBe(true);
    });
});

describe("computePolyLongDivisionLatex", () => {
    it("matches the worked example from the polynom package documentation", () => {
        const latex = computePolyLongDivisionLatex("x^3+x^2-1", "x-1");
        expect(latex).toContain("\\text{Quotient: } x^2 + 2x + 2, \\quad \\text{Remainder: } 1");
        expect(latex).toContain("\\begin{array}{r}");
        expect(latex).toContain("\\end{array}");
    });
});
