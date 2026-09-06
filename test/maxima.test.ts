import { describe, it, expect } from "vitest";
import { latexToMaxima } from "../src/maxima";

describe("latexToMaxima", () => {
    it("strips $ delimiters", () => {
        expect(latexToMaxima("$x+1$")).toBe("x + 1");
        expect(latexToMaxima("$$x+1$$")).toBe("x + 1");
    });

    it("converts fractions", () => {
        expect(latexToMaxima("\\frac{a}{b}")).toBe("a/b");
        expect(latexToMaxima("\\frac{a+b}{c}")).toBe("(a + b)/c");
    });

    it("converts square and nth roots", () => {
        expect(latexToMaxima("\\sqrt{4}")).toBe("sqrt(4)");
        expect(latexToMaxima("\\sqrt[3]{8}")).toBe("8^(1/3)");
    });

    it("converts exponents and subscripts", () => {
        expect(latexToMaxima("x^{2}")).toBe("x^2");
        expect(latexToMaxima("x^{a+b}")).toBe("x^(a + b)");
        expect(latexToMaxima("x_{1}")).toBe("x_1");
    });

    it("converts the quadratic formula", () => {
        expect(latexToMaxima("x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}")).toBe(
            "x = (-b +- sqrt(b^2 - 4*a*c))/(2*a)"
        );
    });

    it("converts trig and log functions", () => {
        expect(latexToMaxima("\\sin x")).toBe("sin(x)");
        expect(latexToMaxima("\\sin(x)")).toBe("sin(x)");
        expect(latexToMaxima("\\ln x")).toBe("log(x)");
    });

    it("converts a definite integral", () => {
        expect(latexToMaxima("\\int_{0}^{1} x^2\\,dx")).toBe("integrate(x^2, x, 0, 1)");
    });

    it("converts an indefinite integral", () => {
        expect(latexToMaxima("\\int x\\,dx")).toBe("integrate(x, x)");
    });

    it("converts a summation", () => {
        expect(latexToMaxima("\\sum_{i=1}^{n} i")).toBe("sum(i, i, 1, n)");
    });

    it("converts a limit", () => {
        expect(latexToMaxima("\\lim_{x \\to 0} \\frac{\\sin x}{x}")).toBe("limit(sin(x)/x, x, 0)");
    });

    it("converts absolute value bars", () => {
        expect(latexToMaxima("|x|")).toBe("abs(x)");
    });

    it("converts constants", () => {
        expect(latexToMaxima("\\pi")).toBe("%pi");
        expect(latexToMaxima("\\infty")).toBe("inf");
    });

    it("inserts implicit multiplication", () => {
        expect(latexToMaxima("2xy")).toBe("2*x*y");
        expect(latexToMaxima("(x+1)(x-1)")).toBe("(x + 1)*(x - 1)");
    });

    it("converts \\cdot, \\times, \\div, \\pm", () => {
        expect(latexToMaxima("3 \\cdot x \\times y \\div 2")).toBe("3*x*y/2");
        expect(latexToMaxima("a \\pm b")).toBe("a +- b");
    });

    it("converts \\left|...\\right| absolute value", () => {
        expect(latexToMaxima("\\left|x-1\\right|")).toBe("abs(x - 1)");
    });

    it("converts nested fractions", () => {
        // a/b/c is left-associative and equivalent to (a/b)/c - no extra
        // parens needed for correctness.
        expect(latexToMaxima("\\frac{\\frac{a}{b}}{c}")).toBe("a/b/c");
    });

    it("converts a pmatrix", () => {
        expect(latexToMaxima("\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}")).toBe(
            "matrix([a, b], [c, d])"
        );
    });
});
