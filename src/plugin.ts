import { Plugin, Notice, Editor, TFile } from "obsidian";
import type { EventRef } from "obsidian";
import type { Rule, MathContext, AutoMathSettings } from "./types";
import { DEFAULT_RULES } from "./rules";
import { DEFAULT_SETTINGS, SMART_LIMIT_OPERATORS } from "./constants";
import { normalizeText, parsePolyLongDivCall } from "./utils";
import { AutoMathSettingsTab } from "./settings";

export default class AutoMathPlugin extends Plugin {
    settings: AutoMathSettings;
    statusEl: HTMLElement | null = null;
    private _rules: Rule[] = [];
    /** The raw overlay (external rules.json if present, else userRulesJson) as last loaded. */
    private _overlayRules: Rule[] = [];
    _workRules: Rule[] | null = null;

    async onload() {
        await this.loadSettings();

        const version = this.manifest?.version ?? "unknown";
        console.debug("[Auto Math] loaded v" + version);

        await this._loadExternalRules(true);
        if (this.settings.debug) {
            const exists = await this._rulesFileExists(this.getFullRulesPath());
            new Notice(`Auto Math: external rules ${exists ? "found" : "not found"}, ${this._getRules().length} active rules`);
        }

        this.statusEl = this.addStatusBarItem();
        this._renderStatus();

        this.addRibbonIcon("divide", "Toggle plugin", () => {
            void this._toggle();
        });

        this.addCommand({
            id: "toggle",
            name: "Toggle",
            callback: () => {
                void this._toggle();
            },
        });

        this.addCommand({
            id: "reload-rules",
            name: "Reload rules",
            callback: async () => {
                const ok = await this._loadExternalRules(true);
                new Notice(
                    ok
                        ? `Rules reloaded (${this._getRules().length})`
                        : "Failed to reload rules (see console)"
                );
            },
        });

        this.addCommand({
            id: "dump-rules",
            name: "Dump rules to console",
            callback: () => {
                console.debug("[Auto Math] active rules:", this._getRules());
                new Notice(`Dumped ${this._getRules().length} rules to console`);
            },
        });

        this.addCommand({
            id: "create-or-open",
            name: "Create or open rules file",
            callback: async () => {
                await this._ensureRulesFile();
                await this._openRulesFile();
            },
        });

        this._registerRulesWatcher();

        this.registerEvent(
            this.app.workspace.on("editor-menu", (menu, editor) => {
                if (!this.settings.enableMaximaConverter) return;
                if (!editor.getSelection()) return;
                const selection = editor.getSelection();
                menu.addItem((item) =>
                    item
                        .setTitle("Copy as Maxima (beta)")
                        .setIcon("sigma")
                        .onClick(async () => {
                            try {
                                const { latexToMaxima } = await import("./maxima");
                                const { showMaximaResult } = await import("./modals");
                                const converted = latexToMaxima(selection);
                                showMaximaResult(this.app, selection, converted);
                            } catch (e) {
                                console.error("[Auto Math] Maxima conversion failed", e);
                                new Notice("Could not convert to Maxima (see console)");
                            }
                        })
                );
            })
        );

        // Remember what kind of input is about to change the document, so that
        // Backspace, paste, drop and undo do not trigger an expansion.
        this.registerDomEvent(
            document,
            "beforeinput",
            (e: InputEvent) => this._noteInput(e.inputType),
            true
        );

        this.registerEvent(
            this.app.workspace.on("editor-change", (editor: Editor) => {
                if (!this.settings.enabled) return;
                if (!editor) return;
                if (!this._takeTypedInput()) return;
                try {
                    this._maybeExpand(editor);
                } catch (e) {
                    console.error("[Auto Math] expand error", e);
                }
                if (this.settings.enablePolyLongDivision) {
                    void this._maybeComputePolyLongDivision(editor);
                }
            })
        );

        this.addSettingTab(new AutoMathSettingsTab(this.app, this));
    }

    private _lastInput = { type: "", at: 0 };
    private _lastRulesLoadAt = 0;

    /** Record the inputType of a browser beforeinput event (typed text vs delete/paste/undo). */
    _noteInput(inputType: string, now: number = Date.now()): void {
        this._lastInput = { type: inputType, at: now };
    }

    /**
     * True once per typed character: the last input was typing and happened a
     * moment ago. Consuming it keeps the plugin's own edit from re-triggering.
     */
    _takeTypedInput(now: number = Date.now()): boolean {
        const { type, at } = this._lastInput;
        this._lastInput = { type: "", at: 0 };
        return /^insert(Text|CompositionText)$/.test(type) && now - at < 500;
    }

    getFullRulesPath(): string {
        return `${this.manifest.dir}/${this.settings.rulesPath}`;
    }

    async _toggle(): Promise<void> {
        this.settings.enabled = !this.settings.enabled;
        await this.saveSettings();
        this._renderStatus();
        new Notice(`Auto Math: ${this.settings.enabled ? "ON" : "OFF"}`);
    }

    _renderStatus() {
        if (!this.statusEl) return;
        this.statusEl.setText(this.settings.enabled ? "Auto Math: ON" : "Auto Math: OFF");
    }

    async _rulesFileExists(path: string): Promise<boolean> {
        try {
            return await this.app.vault.adapter.exists(path);
        } catch {
            return false;
        }
    }

    async _readVaultFile(path: string): Promise<string | null> {
        try {
            return await this.app.vault.adapter.read(path);
        } catch (e: unknown) {
            // File not found is expected behaviour when using built-in rules
            if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'ENOENT') {
                if (this.settings.debug) {
                    console.debug("[Auto Math] rules file not found (using built-in rules):", path);
                }
            } else {
                // Real errors (permissions, corrupted file, etc.) should still be logged
                console.error("[Auto Math] failed to read rules file:", path, e);
            }
            return null;
        }
    }

    async _writeVaultFile(path: string, text: string): Promise<boolean> {
        try {
            await this.app.vault.adapter.write(path, text);
            return true;
        } catch (e) {
            console.error("[Auto Math] write error", e);
            return false;
        }
    }

    async _ensureRulesFile(): Promise<void> {
        const p = this.getFullRulesPath();
        if (!(await this._rulesFileExists(p))) {
            // The external file is an overlay too, same as userRulesJson - seed it
            // with just the user's existing customisations (if any), not a full
            // copy of the built-in pack, so it stays a small, meaningful diff.
            const userRules = this._parseRulesText(this.settings.userRulesJson, false) ?? [];
            const def = JSON.stringify(userRules, null, 2) + "\n";
            const ok = await this._writeVaultFile(p, def);
            new Notice(
                ok
                    ? `Created rules file at ${p}`
                    : "Failed to create rules file (see console)"
            );
        }
    }

    async _openRulesFile(): Promise<void> {
        const p = this.getFullRulesPath();
        try {
            const file = this.app.vault.getAbstractFileByPath(p);
            if (file && file instanceof TFile) {
                await this.app.workspace.getLeaf(true).openFile(file);
            }
        } catch (e) {
            console.error("[Auto Math] cannot open rules file", e);
        }
    }

    /**
     * The external rules.json (if present) and userRulesJson (fallback) are
     * both just an overlay layered on top of the live built-in pack - never
     * a full replacement. That way built-in triggers added in later
     * versions always reach everyone, whichever overlay source is in use.
     */
    async _loadExternalRules(showErrors: boolean): Promise<boolean> {
        const p = this.getFullRulesPath();
        const raw = await this._readVaultFile(p);

        let overlay: Rule[] | null = null;

        if (raw && raw.trim()) {
            const parsed = this._parseRulesText(raw, showErrors);
            if (parsed) {
                overlay = parsed;
                if (this.settings.debug) console.debug("[Auto Math] loaded external rule overlay", parsed);
            } else if (showErrors) {
                console.error("[Auto Math] external rules present but invalid at", p);
            }
        } else if (showErrors && this.settings.debug) {
            console.debug("[Auto Math] external rules not found, using userRulesJson overlay");
        }

        if (overlay === null) {
            overlay = this._parseRulesText(this.settings.userRulesJson, showErrors) ?? [];
        }

        this._overlayRules = overlay;
        this._rules = this._mergeRuleLayers(DEFAULT_RULES, overlay);

        this._lastRulesLoadAt = Date.now();
        if (this.settings.debug) console.debug("[Auto Math] active rules", this._rules);
        return !!this._rules.length;
    }

    /**
     * Layer user rules on top of the built-in pack: a user entry with the
     * same (normalised) trigger overrides the built-in one; any other user
     * entry is added. Result is sorted longest-trigger-first, same as
     * _sanitizeRules, so matching precedence stays correct.
     */
    _mergeRuleLayers(base: Rule[], overlay: Rule[]): Rule[] {
        const byTrigger = new Map<string, Rule>();
        // Store the normalised trigger so matching does not have to redo it per keystroke
        for (const r of base) byTrigger.set(normalizeText(r.trigger), { ...r, trigger: normalizeText(r.trigger) });
        for (const r of overlay) byTrigger.set(normalizeText(r.trigger), { ...r, trigger: normalizeText(r.trigger) });
        return Array.from(byTrigger.values()).sort((a, b) => b.trigger.length - a.trigger.length);
    }

    /** The raw overlay (your customisations only, no built-ins). */
    _getOverlayRules(): Rule[] {
        return this._overlayRules || [];
    }

    /**
     * Clear all customisations and go back to the pure built-in pack: empties
     * the external rules.json (if any) and userRulesJson, then reloads.
     */
    async _resetToDefaults(): Promise<boolean> {
        this.settings.userRulesJson = "[]";
        await this.saveSettings();

        const p = this.getFullRulesPath();
        if (await this._rulesFileExists(p)) {
            await this._writeVaultFile(p, "[]\n");
        }

        return this._loadExternalRules(true);
    }

    _parseRulesText(text: string, showErrors: boolean): Rule[] | null {
        try {
            const trimmed = text.trim();

            if (trimmed.startsWith("[")) {
                const arr = JSON.parse(trimmed) as unknown;
                return this._sanitizeRules(arr);
            }

            const lines = trimmed
                .split(/\n+/)
                .map((l) => l.trim())
                .filter(Boolean);

            const arr: unknown[] = [];
            for (const l of lines) {
                try {
                    arr.push(JSON.parse(l));
                } catch {
                    // ignore invalid lines
                }
            }

            return this._sanitizeRules(arr);
        } catch (e) {
            if (showErrors) console.error("[Auto Math] cannot parse rules", e);
            return null;
        }
    }

    _sanitizeRules(arr: unknown): Rule[] {
        if (!Array.isArray(arr)) return [];

        return arr
            .filter(
                (r: unknown): r is Record<string, unknown> =>
                    r !== null &&
                    typeof r === "object" &&
                    typeof (r as Record<string, unknown>).trigger === "string" &&
                    typeof (r as Record<string, unknown>).expand === "string"
            )
            .map((r) => ({
                trigger: normalizeText(r.trigger as string),
                expand: r.expand as string,
            }))
            .sort((a, b) => b.trigger.length - a.trigger.length);
    }

    _registerRulesWatcher() {
        const onPathChange = async (path: string | undefined) => {
            const currentPath = this.getFullRulesPath();
            if (path !== currentPath) return;
            // Our own load just ran (e.g. after we wrote the file): nothing new to pick up.
            if (Date.now() - this._lastRulesLoadAt < 500) return;
            if (this.settings.debug) {
                console.debug("[Auto Math] detected change in rules file:", currentPath);
            }
            await this._loadExternalRules(true);
            new Notice(`Auto Math: reloaded (${this._getRules().length})`);
        };
        const onFile = (file: TFile) => onPathChange(file?.path);

        this.registerEvent(this.app.vault.on("modify", onFile));
        this.registerEvent(this.app.vault.on("create", onFile));
        this.registerEvent(this.app.vault.on("delete", onFile));
        // rules.json lives in the hidden .obsidian folder, which the vault does not index:
        // there Obsidian reports changes only through the raw event.
        // The event is missing from the public typings, so it is typed here.
        const vaultWithRaw = this.app.vault as unknown as {
            on(name: "raw", callback: (path: string) => unknown): EventRef;
        };
        this.registerEvent(vaultWithRaw.on("raw", (path) => onPathChange(path)));
    }

    _getRules(): Rule[] {
        return this._rules || [];
    }

    /**
     * Detect whether the cursor is inside $...$ or $$...$$ blocks.
     *
     * Supports both single-line and multiline $$...$$ blocks.
     * For multiline blocks, scans up to maxScanLines in both directions.
     */
    _getMathContext(editor: Editor, pos: { line: number; ch: number }): MathContext {
        const currentLine = pos.line;
        const lineText = editor.getLine(currentLine) ?? "";
        const len = lineText.length;

        // Check the current line for single-line patterns (fast path)

        // $$ ... $$ (display) on a single line
        const display: number[] = [];
        for (let i = 0; i < len - 1; i++) {
            if (lineText[i] === "$" && lineText[i + 1] === "$") {
                display.push(i);
                i++;
            }
        }
        for (let i = 0; i + 1 < display.length; i += 2) {
            const start = display[i];
            const end = display[i + 1] + 2;
            if (pos.ch > start && pos.ch <= end) {
                return { type: "display" };
            }
        }

        // $ ... $ (inline) on a single line, ignoring $$ which are already handled
        const singles: number[] = [];
        for (let i = 0; i < len; i++) {
            if (lineText[i] === "$") {
                if (i + 1 < len && lineText[i + 1] === "$") {
                    i++;
                    continue;
                }
                singles.push(i);
            }
        }
        for (let i = 0; i + 1 < singles.length; i += 2) {
            const start = singles[i];
            const end = singles[i + 1] + 1;
            if (pos.ch > start && pos.ch <= end) {
                return { type: "inline" };
            }
        }

        // Check for multiline $$...$$ blocks
        const maxScan = this.settings.maxScanLines || 50;

        // Search upwards for opening $$
        let displayStart: number | null = null;
        for (let i = currentLine - 1; i >= Math.max(0, currentLine - maxScan); i--) {
            const line = editor.getLine(i).trim();
            if (line === "$$") {
                displayStart = i;
                break;
            }
        }

        // If found opening $$, search downwards for closing $$
        if (displayStart !== null) {
            for (let i = currentLine + 1; i < Math.min(editor.lineCount(), currentLine + maxScan); i++) {
                const line = editor.getLine(i).trim();
                if (line === "$$") {
                    if (this.settings.debug) {
                        console.debug(`[Auto Math] multiline display mode detected: lines ${displayStart}-${i}`);
                    }
                    return { type: "display" };
                }
            }
        }

        return { type: "none" };
    }

    _maybeExpand(editor: Editor) {
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);

        // Early exit if cursor at start of line
        if (cursor.ch === 0) return;

        const lastChar = lineText[cursor.ch - 1];

        // With expandOnSpace, a trigger ending in a letter fires only when a space is
        // typed right after it (the space is consumed), so \textbf is not cut short
        // by \text. Triggers ending in a symbol (\lim_, ^, }) still fire at once.
        const deferLetters = this.settings.expandOnSpace;
        const typedSpace = deferLetters && lastChar === " ";
        const matchEnd = typedSpace ? cursor.ch - 1 : cursor.ch;
        if (matchEnd === 0) return;

        // Quick check - last character must be part of a trigger
        // Valid trigger endings: letters, backslash, ^, _, }
        if (!typedSpace && !/[a-zA-Z\\^_}]/.test(lastChar)) return;

        const uptoRaw = lineText.slice(0, matchEnd);
        const upto = normalizeText(uptoRaw);

        const rules = this._getRules();
        if (!rules.length) return;

        for (const rule of rules) {
            const trig = rule.trigger; // already normalised by _mergeRuleLayers

            // Skip if the trigger is longer than what we've typed
            if (trig.length > upto.length) continue;

            if (!upto.endsWith(trig)) continue;

            if (deferLetters && /[a-zA-Z]$/.test(trig) !== typedSpace) continue;

            const delta = uptoRaw.length - upto.length;
            const start = matchEnd - trig.length - delta;
            const before = lineText.slice(0, start);
            const after = lineText.slice(cursor.ch);

            let expanded = rule.expand;

            // Smart limits: choose a template for \int / \sum based on context
            if (this.settings.smartLimits) {
                const smart = SMART_LIMIT_OPERATORS[trig];
                if (smart) {
                    const ctx = this._getMathContext(editor, cursor);
                    if (ctx.type === "display") {
                        expanded = smart.display;
                    } else {
                        expanded = smart.inline;
                    }
                }
            }

            // Handle multiline expansions (containing \n)
            if (expanded.includes('\n')) {
                this._expandMultiline(editor, cursor, before, after, expanded);
            } else {
                this._expandSingleLine(editor, cursor, before, after, expanded);
            }

            if (this.settings.debug) {
                console.debug("[Auto Math] matched trigger", trig, "expanded to", expanded);
            }

            return;
        }
    }

    /**
     * Computed trigger: typing \polylongdiv{dividend}{divisor} (matching the
     * syntax of the real LaTeX `polynom` package, which Obsidian's MathJax
     * cannot execute) replaces it with a locally-computed, step-by-step
     * division rendered as a plain amsmath array.
     */
    async _maybeComputePolyLongDivision(editor: Editor): Promise<void> {
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);
        if (cursor.ch === 0 || lineText[cursor.ch - 1] !== "}") return;

        const upto = normalizeText(lineText.slice(0, cursor.ch));
        const parsed = parsePolyLongDivCall(upto);
        if (!parsed) return;

        const { full, dividend, divisor } = parsed;
        const start = cursor.ch - full.length;
        const before = lineText.slice(0, start);
        const after = lineText.slice(cursor.ch);

        try {
            const { computePolyLongDivisionLatex } = await import("./poly-division");
            const expanded = computePolyLongDivisionLatex(dividend, divisor);

            // The import is async: bail out if the user typed or moved meanwhile.
            const nowCursor = editor.getCursor();
            if (nowCursor.line !== cursor.line || nowCursor.ch !== cursor.ch || editor.getLine(cursor.line) !== lineText) {
                return;
            }
            this._expandMultiline(editor, cursor, before, after, expanded);
            if (this.settings.debug) {
                console.debug("[Auto Math] computed polynomial long division", dividend, divisor);
            }
        } catch (e) {
            console.error("[Auto Math] polynomial long division failed", e);
            new Notice("Could not compute polynomial long division (see console)");
        }
    }

    /**
     * Expand a single-line template
     */
    _expandSingleLine(editor: Editor, cursor: { line: number; ch: number }, before: string, after: string, expanded: string) {
        // Replace only the trigger, not the whole line (keeps other cursors and undo steps intact)
        const from = { line: cursor.line, ch: before.length };
        const to = { line: cursor.line, ch: cursor.ch };

        // Place the cursor inside the first {} if present
        const idxBraces = expanded.indexOf("{}");
        if (idxBraces >= 0) {
            editor.replaceRange(expanded, from, to);
            const pos = before.length + expanded.indexOf("{") + 1;
            editor.setCursor({ line: cursor.line, ch: pos });
        } else {
            // Fallback: support '|' marker as cursor position helper
            const pipe = expanded.indexOf("|");
            if (pipe >= 0) {
                editor.replaceRange(expanded.replace("|", ""), from, to);
                const pos = before.length + pipe;
                editor.setCursor({ line: cursor.line, ch: pos });
            } else {
                editor.replaceRange(expanded, from, to);
                editor.setCursor({
                    line: cursor.line,
                    ch: before.length + expanded.length,
                });
            }
        }
    }

    /**
     * Expand a multiline template (containing \n)
     */
    _expandMultiline(editor: Editor, cursor: { line: number; ch: number }, before: string, after: string, expanded: string) {
        const lines = expanded.split('\n');
        const cursorLine = cursor.line;

        // Find the cursor marker (| or first {})
        let cursorLineOffset = 0;
        let cursorChOffset = 0;
        let foundCursor = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check for | marker
            const pipeIdx = line.indexOf('|');
            if (pipeIdx >= 0 && !foundCursor) {
                cursorLineOffset = i;
                cursorChOffset = pipeIdx;
                foundCursor = true;
                lines[i] = line.replace('|', '');
            }

            // Check for {} marker if no | found yet
            if (!foundCursor) {
                const braceIdx = line.indexOf('{}');
                if (braceIdx >= 0) {
                    cursorLineOffset = i;
                    cursorChOffset = braceIdx + 1;
                    foundCursor = true;
                }
            }
        }

        // Replace only the trigger with the whole expansion in one edit (one undo step);
        // the text after the cursor stays where it is, after the last inserted line.
        editor.replaceRange(
            lines.join('\n'),
            { line: cursorLine, ch: before.length },
            { line: cursorLine, ch: cursor.ch }
        );

        // Position cursor
        if (foundCursor) {
            const finalLine = cursorLine + cursorLineOffset;
            const finalCh = (cursorLineOffset === 0 ? before.length : 0) + cursorChOffset;
            editor.setCursor({ line: finalLine, ch: finalCh });
        } else {
            // Default: end of last line
            editor.setCursor({
                line: cursorLine + lines.length - 1,
                ch: Infinity,
            });
        }
    }

    async loadSettings() {
        const data = (await this.loadData()) as (Partial<AutoMathSettings> & { rulesJson?: string }) | null;

        this.settings = {
            ...DEFAULT_SETTINGS,
            ...(data ?? {}),
        };

        // Migrate the pre-0.2.7 settings shape: `rulesJson` used to hold a
        // full snapshot of built-ins + user edits, which meant new built-in
        // triggers never reached existing installs. Keep only entries that
        // actually differ from (or don't exist in) the current built-in
        // pack, so the migrated overlay stays a small, meaningful diff
        // instead of a full duplicate of DEFAULT_RULES.
        if (data && typeof data.rulesJson === "string" && !("userRulesJson" in data)) {
            const legacy = this._parseRulesText(data.rulesJson, false) ?? [];
            const defaultsByTrigger = new Map(DEFAULT_RULES.map((r) => [normalizeText(r.trigger), r]));
            const overlay = legacy.filter((r) => {
                const builtIn = defaultsByTrigger.get(normalizeText(r.trigger));
                return !builtIn || builtIn.expand !== r.expand;
            });
            this.settings.userRulesJson = JSON.stringify(overlay, null, 2);
            await this.saveSettings();
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
