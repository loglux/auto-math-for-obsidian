import { beforeEach, describe, expect, it } from "vitest";
import AutoMathPlugin from "../src/plugin";
import { DEFAULT_SETTINGS } from "../src/constants";
import { DEFAULT_RULES } from "../src/rules";
import { FakeEditor } from "./fakeEditor";

function createPlugin(overrides: Partial<typeof DEFAULT_SETTINGS> = {}): AutoMathPlugin {
    const plugin = new AutoMathPlugin();
    plugin.settings = { ...DEFAULT_SETTINGS, ...overrides };
    // Bypass the vault-backed loader and use the sanitized default rule pack directly.
    (plugin as unknown as { _rules: unknown })._rules = plugin._sanitizeRules(DEFAULT_RULES);
    return plugin;
}

describe("_getMathContext", () => {
    let plugin: AutoMathPlugin;

    beforeEach(() => {
        plugin = createPlugin();
    });

    it("detects inline math $...$", () => {
        const editor = new FakeEditor("some $x + y$ here", { line: 0, ch: 0 });
        const ctx = plugin._getMathContext(editor as never, { line: 0, ch: 8 });
        expect(ctx.type).toBe("inline");
    });

    it("detects single-line display math $$...$$", () => {
        const editor = new FakeEditor("$$x + y$$", { line: 0, ch: 0 });
        const ctx = plugin._getMathContext(editor as never, { line: 0, ch: 5 });
        expect(ctx.type).toBe("display");
    });

    it("does not treat position outside $...$ as math", () => {
        const editor = new FakeEditor("before $x$ after", { line: 0, ch: 0 });
        const ctx = plugin._getMathContext(editor as never, { line: 0, ch: 2 });
        expect(ctx.type).toBe("none");
    });

    it("detects multiline display blocks by scanning up and down", () => {
        const editor = new FakeEditor("$$\nx + y\n$$", { line: 1, ch: 3 });
        const ctx = plugin._getMathContext(editor as never, { line: 1, ch: 3 });
        expect(ctx.type).toBe("display");
    });

    it("does not scan beyond maxScanLines for the opening $$", () => {
        plugin.settings.maxScanLines = 1;
        const lines = ["$$", "gap", "x + y"];
        const editor = new FakeEditor(lines.join("\n"), { line: 2, ch: 1 });
        const ctx = plugin._getMathContext(editor as never, { line: 2, ch: 1 });
        expect(ctx.type).toBe("none");
    });
});

describe("_maybeExpand / single-line expansion", () => {
    let plugin: AutoMathPlugin;

    beforeEach(() => {
        plugin = createPlugin();
    });

    it("expands \\frac and places the cursor inside the first {}", () => {
        const editor = new FakeEditor("\\frac", { line: 0, ch: 5 });
        plugin._maybeExpand(editor as never);
        expect(editor.getLine(0)).toBe("\\frac{}{}");
        expect(editor.getCursor()).toEqual({ line: 0, ch: 6 });
    });

    it("preserves surrounding text before and after the trigger", () => {
        const editor = new FakeEditor("$\\sqrt$", { line: 0, ch: 6 });
        plugin._maybeExpand(editor as never);
        expect(editor.getLine(0)).toBe("$\\sqrt{}$");
    });

    it("expands \\paren to auto-sized round delimiters", () => {
        const editor = new FakeEditor("\\paren", { line: 0, ch: 6 });
        plugin._maybeExpand(editor as never);
        expect(editor.getLine(0)).toBe("\\left({}\\right)");
    });

    it("expands \\brack to auto-sized square delimiters", () => {
        const editor = new FakeEditor("\\brack", { line: 0, ch: 6 });
        plugin._maybeExpand(editor as never);
        expect(editor.getLine(0)).toBe("\\left[{}\\right]");
    });

    it("expands \\brace to auto-sized curly delimiters", () => {
        const editor = new FakeEditor("\\brace", { line: 0, ch: 6 });
        plugin._maybeExpand(editor as never);
        expect(editor.getLine(0)).toBe("\\left\\{{}\\right\\}");
    });

    it("expands \\substack for multi-line subscripts", () => {
        const editor = new FakeEditor("\\substack", { line: 0, ch: 9 });
        plugin._maybeExpand(editor as never);
        expect(editor.getLine(0)).toBe("\\substack{}");
    });

    it("prefers the longest matching trigger when one is a suffix of another", () => {
        // sanitizeRules sorts rules by trigger length, longest first, so the
        // more specific "xab" trigger must win over the shorter "ab" it contains.
        (plugin as unknown as { _rules: unknown })._rules = plugin._sanitizeRules([
            { trigger: "ab", expand: "SHORT{}" },
            { trigger: "xab", expand: "LONG{}" },
        ]);
        const editor = new FakeEditor("xab", { line: 0, ch: 3 });
        plugin._maybeExpand(editor as never);
        expect(editor.getLine(0)).toBe("LONG{}");
    });

    it("does nothing when the cursor is at the start of the line", () => {
        const editor = new FakeEditor("", { line: 0, ch: 0 });
        plugin._maybeExpand(editor as never);
        expect(editor.getLine(0)).toBe("");
    });

    it("does nothing when no rule matches", () => {
        const editor = new FakeEditor("hello", { line: 0, ch: 5 });
        plugin._maybeExpand(editor as never);
        expect(editor.getLine(0)).toBe("hello");
    });

    it("ignores zero-width characters inside the typed trigger", () => {
        const editor = new FakeEditor("\\fr\u200Bac", { line: 0, ch: 6 });
        plugin._maybeExpand(editor as never);
        expect(editor.getLine(0)).toBe("\\frac{}{}");
    });
});

describe("_maybeExpand / smart limits", () => {
    it("uses the display template for \\int inside a multiline $$...$$ block", () => {
        const plugin = createPlugin({ smartLimits: true });
        const editor = new FakeEditor("$$\n\\int\n$$", { line: 1, ch: 4 });
        plugin._maybeExpand(editor as never);
        expect(editor.getLine(1)).toBe("\\int\\limits_{}^{}");
    });

    it("uses the inline template for \\int outside display math", () => {
        const plugin = createPlugin({ smartLimits: true });
        const editor = new FakeEditor("\\int", { line: 0, ch: 4 });
        plugin._maybeExpand(editor as never);
        expect(editor.getLine(0)).toBe("\\int_{}^{}");
    });
});

describe("_maybeExpand / multiline expansion", () => {
    let plugin: AutoMathPlugin;

    beforeEach(() => {
        plugin = createPlugin();
    });

    it("expands \\align across multiple lines and positions the cursor at the marker", () => {
        const editor = new FakeEditor("\\align", { line: 0, ch: 6 });
        plugin._maybeExpand(editor as never);
        expect(editor.text()).toBe("\\begin{align}\n\n\\end{align}");
        expect(editor.getCursor()).toEqual({ line: 1, ch: 0 });
    });

    it("expands \\vmatrix without matching the shorter \\matrix trigger", () => {
        const editor = new FakeEditor("\\vmatrix", { line: 0, ch: 8 });
        plugin._maybeExpand(editor as never);
        expect(editor.text()).toBe("\\begin{vmatrix}\n\n\\end{vmatrix}");
    });

    it("expands \\Vmatrix (double bars) distinctly from \\vmatrix", () => {
        const editor = new FakeEditor("\\Vmatrix", { line: 0, ch: 8 });
        plugin._maybeExpand(editor as never);
        expect(editor.text()).toBe("\\begin{Vmatrix}\n\n\\end{Vmatrix}");
    });

    it("keeps trailing text on the line after the expansion trigger", () => {
        const editor = new FakeEditor("\\align rest", { line: 0, ch: 6 });
        plugin._maybeExpand(editor as never);
        expect(editor.text()).toBe("\\begin{align}\n\n\\end{align} rest");
    });

    it("expands \\multline across multiple lines", () => {
        const editor = new FakeEditor("\\multline", { line: 0, ch: 9 });
        plugin._maybeExpand(editor as never);
        expect(editor.text()).toBe("\\begin{multline}\n\n\\end{multline}");
    });

    it("expands \\smallmatrix without matching the shorter \\matrix trigger", () => {
        const editor = new FakeEditor("\\smallmatrix", { line: 0, ch: 12 });
        plugin._maybeExpand(editor as never);
        expect(editor.text()).toBe("\\begin{smallmatrix}\n\n\\end{smallmatrix}");
    });

    it("expands \\alignat and positions the cursor inside the column-count braces", () => {
        const editor = new FakeEditor("\\alignat", { line: 0, ch: 8 });
        plugin._maybeExpand(editor as never);
        expect(editor.text()).toBe("\\begin{alignat}{}\n\n\\end{alignat}");
        expect(editor.getCursor()).toEqual({ line: 0, ch: 16 });
    });
});

describe("_sanitizeRules", () => {
    let plugin: AutoMathPlugin;

    beforeEach(() => {
        plugin = createPlugin();
    });

    it("drops entries missing a string trigger or expand", () => {
        const result = plugin._sanitizeRules([
            { trigger: "\\ok", expand: "\\ok{}" },
            { trigger: "\\bad" },
            { expand: "no trigger" },
            null,
            "not an object",
        ]);
        expect(result).toEqual([{ trigger: "\\ok", expand: "\\ok{}" }]);
    });

    it("sorts rules by trigger length, longest first", () => {
        const result = plugin._sanitizeRules([
            { trigger: "\\a", expand: "1" },
            { trigger: "\\abc", expand: "2" },
            { trigger: "\\ab", expand: "3" },
        ]);
        expect(result.map((r) => r.trigger)).toEqual(["\\abc", "\\ab", "\\a"]);
    });

    it("returns an empty array for non-array input", () => {
        expect(plugin._sanitizeRules(undefined)).toEqual([]);
        expect(plugin._sanitizeRules({})).toEqual([]);
    });
});

describe("_mergeRuleLayers", () => {
    let plugin: AutoMathPlugin;

    beforeEach(() => {
        plugin = createPlugin();
    });

    it("keeps built-in rules the user hasn't touched", () => {
        const merged = plugin._mergeRuleLayers(
            [{ trigger: "\\frac", expand: "\\frac{}{}" }],
            []
        );
        expect(merged).toEqual([{ trigger: "\\frac", expand: "\\frac{}{}" }]);
    });

    it("lets a user rule override a built-in one with the same trigger", () => {
        const merged = plugin._mergeRuleLayers(
            [{ trigger: "\\frac", expand: "\\frac{}{}" }],
            [{ trigger: "\\frac", expand: "\\dfrac{}{}" }]
        );
        expect(merged).toEqual([{ trigger: "\\frac", expand: "\\dfrac{}{}" }]);
    });

    it("adds user rules that don't exist in the built-in pack", () => {
        const merged = plugin._mergeRuleLayers(
            [{ trigger: "\\frac", expand: "\\frac{}{}" }],
            [{ trigger: "\\myrule", expand: "\\myrule{}" }]
        );
        expect(merged.map((r) => r.trigger).sort()).toEqual(["\\frac", "\\myrule"].sort());
    });

});

describe("_loadExternalRules fallback (no external file)", () => {
    it("merges built-in DEFAULT_RULES with the user layer, giving new built-ins for free", async () => {
        const plugin = new AutoMathPlugin(undefined, { dir: "vault/.obsidian/plugins/auto-math" });
        plugin.settings = {
            ...DEFAULT_SETTINGS,
            userRulesJson: JSON.stringify([
                { trigger: "\\frac", expand: "\\dfrac{}{}" },
                { trigger: "\\myrule", expand: "\\myrule{}" },
            ]),
        };

        const ok = await plugin._loadExternalRules(false);
        expect(ok).toBe(true);

        const rules = plugin._getRules();
        expect(rules.find((r) => r.trigger === "\\frac")?.expand).toBe("\\dfrac{}{}");
        expect(rules.some((r) => r.trigger === "\\myrule")).toBe(true);
        // A built-in that was never mentioned in the user layer is still present.
        expect(rules.some((r) => r.trigger === "\\paren")).toBe(true);
    });
});

function createPluginWithVault(files: Record<string, string>): AutoMathPlugin {
    const plugin = new AutoMathPlugin(
        {
            vault: {
                adapter: {
                    exists: async (p: string) => p in files,
                    read: async (p: string) => {
                        if (!(p in files)) {
                            const err = new Error("not found") as Error & { code: string };
                            err.code = "ENOENT";
                            throw err;
                        }
                        return files[p];
                    },
                    write: async (p: string, text: string) => {
                        files[p] = text;
                    },
                },
            },
        },
        { dir: "vault/.obsidian/plugins/auto-math" }
    );
    plugin.settings = { ...DEFAULT_SETTINGS };
    return plugin;
}

describe("_loadExternalRules with an external file", () => {
    it("treats the file as an overlay on top of DEFAULT_RULES, not a full replacement", async () => {
        const files: Record<string, string> = {
            "vault/.obsidian/plugins/auto-math/rules.json": JSON.stringify([
                { trigger: "\\frac", expand: "\\dfrac{}{}" },
            ]),
        };
        const plugin = createPluginWithVault(files);

        const ok = await plugin._loadExternalRules(false);
        expect(ok).toBe(true);

        const rules = plugin._getRules();
        expect(rules.find((r) => r.trigger === "\\frac")?.expand).toBe("\\dfrac{}{}");
        // Built-ins not mentioned in the file are still active.
        expect(rules.some((r) => r.trigger === "\\paren")).toBe(true);
    });

    it("exposes the overlay alone via _getOverlayRules, without the built-ins", async () => {
        const files: Record<string, string> = {
            "vault/.obsidian/plugins/auto-math/rules.json": JSON.stringify([
                { trigger: "\\myrule", expand: "\\myrule{}" },
            ]),
        };
        const plugin = createPluginWithVault(files);

        await plugin._loadExternalRules(false);

        expect(plugin._getOverlayRules()).toEqual([{ trigger: "\\myrule", expand: "\\myrule{}" }]);
        expect(plugin._getRules().length).toBeGreaterThan(1);
    });
});

describe("_resetToDefaults", () => {
    it("clears both the external file and userRulesJson, restoring the pure built-in pack", async () => {
        const files: Record<string, string> = {
            "vault/.obsidian/plugins/auto-math/rules.json": JSON.stringify([
                { trigger: "\\paren", expand: "\\left({}\\right){}" },
                { trigger: "\\myrule", expand: "\\myrule{}" },
            ]),
        };
        const plugin = createPluginWithVault(files);
        plugin.settings.userRulesJson = JSON.stringify([{ trigger: "\\other", expand: "\\other{}" }]);
        await plugin._loadExternalRules(false);
        expect(plugin._getRules().find((r) => r.trigger === "\\paren")?.expand).toBe("\\left({}\\right){}");

        const ok = await plugin._resetToDefaults();

        expect(ok).toBe(true);
        expect(plugin.settings.userRulesJson).toBe("[]");
        expect(plugin._getOverlayRules()).toEqual([]);
        expect(plugin._getRules().find((r) => r.trigger === "\\paren")?.expand).toBe("\\left({}\\right)");
        expect(plugin._getRules().some((r) => r.trigger === "\\myrule")).toBe(false);
    });
});

describe("loadSettings migration", () => {
    it("keeps genuine customisations from a pre-0.2.7 rulesJson snapshot", async () => {
        const plugin = new AutoMathPlugin(undefined, { dir: "vault/.obsidian/plugins/auto-math" });
        const legacyRulesJson = JSON.stringify([{ trigger: "\\myrule", expand: "\\myrule{}" }]);
        plugin.loadData = async () => ({ enabled: false, rulesJson: legacyRulesJson });

        await plugin.loadSettings();

        expect(JSON.parse(plugin.settings.userRulesJson)).toEqual([
            { trigger: "\\myrule", expand: "\\myrule{}" },
        ]);
        expect(plugin.settings.enabled).toBe(false);
    });

    it("drops legacy entries that are identical to the current built-in pack, keeps overrides", async () => {
        const plugin = new AutoMathPlugin(undefined, { dir: "vault/.obsidian/plugins/auto-math" });
        const legacyRulesJson = JSON.stringify([
            { trigger: "\\sqrt", expand: "\\sqrt{}" }, // unchanged built-in - should be dropped
            { trigger: "\\frac", expand: "\\dfrac{}{}" }, // overridden built-in - kept
            { trigger: "\\myrule", expand: "\\myrule{}" }, // genuine custom - kept
        ]);
        plugin.loadData = async () => ({ rulesJson: legacyRulesJson });

        await plugin.loadSettings();

        const migrated = JSON.parse(plugin.settings.userRulesJson);
        expect(migrated.some((r: { trigger: string }) => r.trigger === "\\sqrt")).toBe(false);
        expect(migrated.some((r: { trigger: string }) => r.trigger === "\\myrule")).toBe(true);
        expect(migrated.find((r: { trigger: string }) => r.trigger === "\\frac")?.expand).toBe("\\dfrac{}{}");
    });

    it("leaves userRulesJson at its default when there is no saved data", async () => {
        const plugin = new AutoMathPlugin(undefined, { dir: "vault/.obsidian/plugins/auto-math" });

        await plugin.loadSettings();

        expect(plugin.settings.userRulesJson).toBe(DEFAULT_SETTINGS.userRulesJson);
    });
});
