import { Plugin, Notice, Setting, Editor, PluginSettingTab, App, TFile, Modal } from "obsidian";
import { DEFAULT_RULES, type Rule } from "./rules";

// Remove zero-width characters (they break trigger matching)
function normalizeText(s: string | null | undefined): string {
    return (s ?? "").replace(/[\u200B\uFEFF]/g, "");
}


interface SmartOperator {
    inline: string;
    display: string;
}

interface ConflictGroup {
    key: string;
    trigger: string;
    options: Rule[];
    defaultIndex: number;
}

class ConflictResolutionModal extends Modal {
    private readonly groups: ConflictGroup[];
    private readonly selections = new Map<string, number>();
    private resolver: ((value: Map<string, Rule> | null) => void) | null = null;
    private completed = false;

    constructor(app: App, groups: ConflictGroup[]) {
        super(app);
        this.groups = groups;
        for (const group of groups) {
            this.selections.set(group.key, group.defaultIndex);
        }
    }

    openAndWait(): Promise<Map<string, Rule> | null> {
        const promise = new Promise<Map<string, Rule> | null>((resolve) => {
            this.resolver = resolve;
        });
        this.open();
        return promise;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Resolve conflicts" });
        contentEl.createEl("p", {
            text: "Choose the expansion to keep for each trigger.",
        });

        for (const group of this.groups) {
            new Setting(contentEl)
                .setName(`Trigger: ${group.trigger}`)
                .setDesc("Select the expansion to keep")
                .addDropdown((d) => {
                    group.options.forEach((opt, idx) => {
                        d.addOption(String(idx), opt.expand);
                    });
                    d.setValue(String(group.defaultIndex));
                    d.onChange((v) => {
                        this.selections.set(group.key, Number(v));
                    });
                });
        }

        const actions = contentEl.createDiv();
        new Setting(actions)
            .addButton((b) =>
                b.setButtonText("Save").setCta().onClick(() => {
                    const resolved = new Map<string, Rule>();
                    for (const group of this.groups) {
                        const idx = this.selections.get(group.key) ?? group.defaultIndex;
                        resolved.set(group.key, group.options[idx]);
                    }
                    this.completed = true;
                    this.close();
                    this.resolver?.(resolved);
                })
            )
            .addButton((b) =>
                b.setButtonText("Cancel").onClick(() => {
                    this.completed = true;
                    this.close();
                    this.resolver?.(null);
                })
            );
    }

    onClose() {
        if (!this.completed) {
            this.resolver?.(null);
        }
        this.resolver = null;
    }
}

function resolveRuleConflicts(app: App, groups: ConflictGroup[]): Promise<Map<string, Rule> | null> {
    const modal = new ConflictResolutionModal(app, groups);
    return modal.openAndWait();
}

/*
 * Smart limit operators
 * These operators switch between inline and display variants.
 * inline → compact form
 * display → operator with \limits for top/bottom indices
 */
const SMART_LIMIT_OPERATORS: Record<string, SmartOperator> = {
    "\\int": {
        inline: "\\int_{}^{}",
        display: "\\int\\limits_{}^{}",
    },
    // Note: \sum works correctly without explicit \limits in both modes
    // Uncomment if needed:
    // "\\sum": {
    //     inline: "\\sum_{}^{}",
    //     display: "\\sum\\limits_{}^{}",
    // },
};

interface AutoMathSettings {
    enabled: boolean;
    rulesPath: string;
    debug: boolean;
    smartLimits: boolean;
    maxScanLines: number;
    rulesJson: string;
}

// Default plugin settings
const DEFAULT_SETTINGS: AutoMathSettings = {
    enabled: true,
    rulesPath: "rules.json",
    debug: false,
    smartLimits: false, // disabled by default - enable in settings if needed
    maxScanLines: 50, // maximum lines to scan for multiline $$...$$ blocks
    rulesJson: JSON.stringify(DEFAULT_RULES, null, 2),
};

interface MathContext {
    type: "inline" | "display" | "none";
}

export default class AutoMathPlugin extends Plugin {
    settings: AutoMathSettings;
    statusEl: HTMLElement | null = null;
    private _rules: Rule[] = [];
    _workRules: Rule[] | null = null;

    async onload() {
        await this.loadSettings();

        const version = this.manifest?.version ?? "unknown";
        console.debug("[Auto Math] loaded v" + version);

        const rulesPath = this.getFullRulesPath();
        const exists = await this._rulesFileExists(rulesPath);
        new Notice(
            exists
                ? `Auto Math: external rules found`
                : `Auto Math: external rules not found`
        );

        await this._loadExternalRules(true);
        new Notice(`Auto Math: ${this._getRules().length} active rules`);

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
            this.app.workspace.on("editor-change", (editor: Editor) => {
                if (!this.settings.enabled) return;
                if (!editor) return;
                try {
                    this._maybeExpand(editor);
                } catch (e) {
                    console.error("[Auto Math] expand error", e);
                }
            })
        );

        this.addSettingTab(new AutoMathSettingsTab(this.app, this));
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
            const def = JSON.stringify(DEFAULT_RULES, null, 2) + "\n";
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

    async _loadExternalRules(showErrors: boolean): Promise<boolean> {
        const p = this.getFullRulesPath();
        const raw = await this._readVaultFile(p);

        if (raw && raw.trim()) {
            const parsed = this._parseRulesText(raw, showErrors);
            if (parsed && parsed.length) {
                this._rules = parsed;
                if (this.settings.debug) console.debug("[Auto Math] loaded external rules", parsed);
                return true;
            }
            if (showErrors) console.error("[Auto Math] external rules present but invalid at", p);
        } else {
            if (showErrors && this.settings.debug) {
                console.debug("[Auto Math] external rules not found, using built-in pack");
            }
        }

        const fallback = this._parseRulesText(this.settings.rulesJson, showErrors);
        this._rules = Array.isArray(fallback) ? fallback : [];

        if (this.settings.debug) console.debug("[Auto Math] loaded fallback rules", this._rules);
        return !!this._rules.length;
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
        const onChange = async (file: TFile) => {
            const currentPath = this.getFullRulesPath();
            if (file && file.path === currentPath) {
                if (this.settings.debug) {
                    console.debug("[Auto Math] detected change in rules file:", currentPath);
                }
                await this._loadExternalRules(true);
                new Notice(`Auto Math: reloaded (${this._getRules().length})`);
            }
        };

        this.registerEvent(this.app.vault.on("modify", onChange));
        this.registerEvent(this.app.vault.on("create", onChange));
        this.registerEvent(this.app.vault.on("delete", onChange));
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

        // Quick check - last character must be part of a trigger
        // Valid trigger endings: letters, backslash, ^, _, }
        if (!/[a-zA-Z\\^_}]/.test(lastChar)) return;

        const uptoRaw = lineText.slice(0, cursor.ch);
        const upto = normalizeText(uptoRaw);

        const rules = this._getRules();
        if (!rules.length) return;

        for (const rule of rules) {
            const trig = normalizeText(rule.trigger);

            // Skip if the trigger is longer than what we've typed
            if (trig.length > upto.length) continue;

            if (!upto.endsWith(trig)) continue;

            const delta = uptoRaw.length - upto.length;
            const start = cursor.ch - trig.length - delta;
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
     * Expand a single-line template
     */
    _expandSingleLine(editor: Editor, cursor: { line: number; ch: number }, before: string, after: string, expanded: string) {
        editor.setLine(cursor.line, before + expanded + after);

        // Place the cursor inside the first {} if present
        const idxBraces = expanded.indexOf("{}");
        if (idxBraces >= 0) {
            const pos = before.length + expanded.indexOf("{") + 1;
            editor.setCursor({ line: cursor.line, ch: pos });
        } else {
            // Fallback: support '|' marker as cursor position helper
            const pipe = expanded.indexOf("|");
            if (pipe >= 0) {
                editor.setLine(cursor.line, before + expanded.replace("|", "") + after);
                const pos = before.length + pipe;
                editor.setCursor({ line: cursor.line, ch: pos });
            } else {
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

        // Replace current line with first line of expansion
        editor.setLine(cursorLine, before + lines[0] + (lines.length === 1 ? after : ''));

        // Insert remaining lines
        if (lines.length > 1) {
            for (let i = 1; i < lines.length; i++) {
                const isLastLine = i === lines.length - 1;
                const content = isLastLine ? lines[i] + after : lines[i];
                editor.replaceRange(
                    '\n' + content,
                    { line: cursorLine + i - 1, ch: Infinity }
                );
            }
        }

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
        const data = (await this.loadData()) as AutoMathSettings | null;

        this.settings = {
            ...DEFAULT_SETTINGS,
            ...(data ?? {}),
        };
    }



    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class AutoMathSettingsTab extends PluginSettingTab {
    plugin: AutoMathPlugin;

    constructor(app: App, plugin: AutoMathPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("Enabled")
            .setDesc("Turn the plugin on or off.")
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.enabled)
                    .onChange(async (v) => {
                        this.plugin.settings.enabled = v;
                        await this.plugin.saveSettings();
                        this.plugin._renderStatus();
                    })
            );

        new Setting(containerEl)
            .setName("Rules file path")
            .setDesc(
                `Path relative to plugin folder (default: rules.json). Full path: ${this.plugin.getFullRulesPath()}`
            )
            .addText((t) =>
                t
                    .setValue(this.plugin.settings.rulesPath)
                    .onChange(async (v) => {
                        this.plugin.settings.rulesPath =
                            v.trim() || "rules.json";
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Reload rules now")
            .setDesc("Force reload from the external file and validate JSON")
            .addButton((b) =>
                b.setButtonText("Reload").onClick(async () => {
                    const ok = await this.plugin._loadExternalRules(true);
                    new Notice(
                        ok
                            ? `Rules reloaded (${this.plugin._getRules().length})`
                            : "Failed to reload rules (see console)"
                    );
                })
            );

        new Setting(containerEl)
            .setName("Create / open rules file")
            .setDesc("Create external rules file if missing and open it in a new tab")
            .addButton((b) =>
                b.setButtonText("Create / open").onClick(async () => {
                    await this.plugin._ensureRulesFile();
                    await this.plugin._openRulesFile();
                })
            );

        new Setting(containerEl)
            .setName("Debug logs")
            .setDesc("Log rule matches and loading to the developer console")
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.debug)
                    .onChange(async (v) => {
                        this.plugin.settings.debug = v;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Smart limits")
            .setDesc(
                "Automatically choose \\int/\\int\\limits when expanding inside $...$ or $$...$$."
            )
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.smartLimits)
                    .onChange(async (v) => {
                        this.plugin.settings.smartLimits = v;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl).setName("Custom rules editor").setHeading();

        const help = containerEl.createDiv();
        help.setText(
            "Edit your rules below. Use double backslashes \\\\ in triggers/expansions. '|' marks cursor; '{}' places cursor inside the first braces."
        );
        help.setAttr("style", "margin: 6px 0; opacity: .8;");

        let work = this.plugin._workRules || null;
        let filter = "";
        let isDirty = false;

        const metaEl = containerEl.createDiv();
        metaEl.setAttr("style", "margin: 6px 0;");
        const statusEl = metaEl.createDiv();
        const warningsEl = metaEl.createDiv();

        const controlsEl = containerEl.createDiv();
        new Setting(controlsEl)
            .setName("Filter")
            .setDesc("Filter by trigger or expansion text")
            .addText((t) => {
                t.setPlaceholder("\\\\frac, \\\\int, begin{align}")
                    .onChange((v) => {
                        filter = v.trim().toLowerCase();
                        void renderEditor();
                    });
            });

        new Setting(controlsEl)
            .setName("Sort")
            .setDesc("Sort rules by trigger (a to z)")
            .addButton((b) =>
                b.setButtonText("Sort now").onClick(() => {
                    if (work) {
                        work.sort((a, b) => a.trigger.localeCompare(b.trigger));
                        markDirty();
                        void renderEditor();
                    }
                })
            );

        const editorEl = containerEl.createDiv();

        const getIssues = () => {
            const emptyTriggers = (work || []).filter((r) => !r.trigger.trim()).length;
            const emptyExpands = (work || []).filter((r) => !r.expand.trim()).length;
            const counts = new Map<string, number>();
            for (const rule of work || []) {
                const key = normalizeText(rule.trigger).trim();
                if (!key) continue;
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
            const conflicts = [...counts.entries()]
                .filter(([, count]) => count > 1)
                .map(([key]) => key);

            return { emptyTriggers, emptyExpands, conflicts };
        };

        const updateMeta = () => {
            statusEl.setText(isDirty ? "Unsaved changes" : "All changes saved");

            const issues = getIssues();
            const parts: string[] = [];
            if (issues.emptyTriggers) parts.push(`Empty triggers: ${issues.emptyTriggers}`);
            if (issues.emptyExpands) parts.push(`Empty expansions: ${issues.emptyExpands}`);
            if (issues.conflicts.length) parts.push(`Conflicting triggers: ${issues.conflicts.join(", ")}`);

            warningsEl.setText(parts.length ? parts.join(" • ") : "");
            warningsEl.setAttr("style", parts.length ? "opacity: .85;" : "opacity: .5;");
        };

        const markDirty = () => {
            isDirty = true;
            updateMeta();
        };

        const renderEditor = async (opts: { reload: boolean } = { reload: false }) => {
            editorEl.empty();

            if (!work || opts.reload) {
                await this.plugin._loadExternalRules(true);
                work = this.plugin._getRules().map((r) => ({ ...r }));
                this.plugin._workRules = work;
                isDirty = false;
            }

            const list = editorEl.createDiv();
            list.addClass("am-rules-list");

            if (work) {
                work.forEach((rule, idx) => {
                    const searchable = `${rule.trigger} ${rule.expand}`.toLowerCase();
                    if (filter && !searchable.includes(filter)) return;

                    const row = list.createDiv({ cls: "am-rule-row" });

                    new Setting(row)
                        .setName("Trigger")
                        .addText((t) => {
                            t.setValue(rule.trigger).onChange((v) => {
                                rule.trigger = v;
                                markDirty();
                            });
                        });

                    new Setting(row)
                        .setName("Expand")
                        .addText((t) => {
                            t.setValue(rule.expand).onChange((v) => {
                                rule.expand = v;
                                markDirty();
                            });
                        });

                    new Setting(row).addButton((b) =>
                        b.setButtonText("Delete").onClick(() => {
                            if (work) {
                                work.splice(idx, 1);
                                markDirty();
                                void renderEditor();
                            }
                        })
                    );

                    row.createEl("hr");
                });
            }

            const addWrap = editorEl.createDiv();
            new Setting(addWrap)
                .setName("Add new rule")
                .addButton((b) =>
                    b.setButtonText("Add").onClick(() => {
                        if (work) {
                            work.push({ trigger: "\\\\new", expand: "\\\\new{}" });
                            markDirty();
                            void renderEditor();
                        }
                    })
                );

            const actions = editorEl.createDiv();
            new Setting(actions)
                .setName("Save rules to file")
                .setDesc(`Writes JSON to ${this.plugin.getFullRulesPath()}`)
                .addButton((b) =>
                    b.setButtonText("Save").onClick(async () => {
                        if (!work) return;

                        let removedEmpty = 0;
                        const candidates: Rule[] = [];

                        for (const r of work) {
                            if (!r || typeof r.trigger !== "string" || typeof r.expand !== "string") {
                                removedEmpty++;
                                continue;
                            }
                            const trigger = r.trigger.trim();
                            const expand = r.expand.trim();
                            if (!trigger || !expand) {
                                removedEmpty++;
                                continue;
                            }
                            candidates.push({ trigger, expand });
                        }

                        const byKey = new Map<string, Rule[]>();
                        for (const r of candidates) {
                            const key = normalizeText(r.trigger).trim();
                            const list = byKey.get(key);
                            if (list) {
                                list.push(r);
                            } else {
                                byKey.set(key, [r]);
                            }
                        }

                        const resolved: Rule[] = [];
                        const conflicts: ConflictGroup[] = [];

                        for (const [key, list] of byKey) {
                            const options: Rule[] = [];
                            const expandIndex = new Map<string, number>();
                            let defaultIndex = 0;

                            for (let i = 0; i < list.length; i++) {
                                const rule = list[i];
                                if (!expandIndex.has(rule.expand)) {
                                    expandIndex.set(rule.expand, options.length);
                                    options.push(rule);
                                }
                                if (i === list.length - 1) {
                                    defaultIndex = expandIndex.get(rule.expand) ?? 0;
                                }
                            }

                            if (options.length <= 1) {
                                resolved.push(list[list.length - 1]);
                            } else {
                                conflicts.push({
                                    key,
                                    trigger: list[list.length - 1].trigger,
                                    options,
                                    defaultIndex,
                                });
                            }
                        }

                        if (conflicts.length) {
                            const selection = await resolveRuleConflicts(this.app, conflicts);
                            if (!selection) {
                                new Notice("Save canceled");
                                return;
                            }
                            for (const group of conflicts) {
                                const chosen = selection.get(group.key);
                                if (chosen) resolved.push(chosen);
                            }
                        }

                        const cleaned = resolved.sort((a, b) => a.trigger.localeCompare(b.trigger));

                        const text = JSON.stringify(cleaned, null, 2) + "\n";
                        const ok = await this.plugin._writeVaultFile(
                            this.plugin.getFullRulesPath(),
                            text
                        );
                        if (ok) {
                            this.plugin._workRules = null;
                            isDirty = false;
                            await this.plugin._loadExternalRules(true);
                            const parts: string[] = [];
                            if (conflicts.length) {
                                parts.push(`resolved ${conflicts.length} conflicts`);
                            }
                            if (removedEmpty) {
                                parts.push(`removed ${removedEmpty} empty`);
                            }
                            const removedDuplicates = candidates.length - cleaned.length;
                            if (removedDuplicates > 0) {
                                parts.push(`removed ${removedDuplicates} duplicates`);
                            }
                            new Notice(
                                parts.length
                                    ? `Saved ${cleaned.length} rules (${parts.join(", ")})`
                                    : `Saved ${cleaned.length} rules`
                            );
                            await renderEditor({ reload: true });
                        } else {
                            new Notice("Failed to save rules (see console)");
                        }
                    })
                )
                .addButton((b) =>
                    b.setButtonText("Discard").onClick(() => {
                        this.plugin._workRules = null;
                        work = null;
                        isDirty = false;
                        new Notice("Changes discarded");
                        void renderEditor({ reload: true });
                    })
                );

            updateMeta();
        };

        void renderEditor();
    }
}
