import { App, Notice, Setting, PluginSettingTab } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type { Rule, ConflictGroup } from "./types";
import { normalizeText } from "./utils";
import { resolveRuleConflicts } from "./modals";
import { DEFAULT_RULES } from "./rules";
import type AutoMathPlugin from "./plugin";

const DEFAULTS_BY_TRIGGER = new Map(DEFAULT_RULES.map((r) => [normalizeText(r.trigger), r]));

function isBuiltInTrigger(r: Rule): boolean {
    return DEFAULTS_BY_TRIGGER.has(normalizeText(r.trigger));
}

export class AutoMathSettingsTab extends PluginSettingTab {
    plugin: AutoMathPlugin;

    constructor(app: App, plugin: AutoMathPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Declarative entry point (Obsidian 1.13.0+): makes every row searchable
     * from the main settings search. Each row reuses the same configure/render
     * logic as display(), so behaviour is identical either way.
     */
    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            {
                name: "Enabled",
                desc: "Turn the plugin on or off.",
                render: (setting) => this._configureEnabledToggle(setting),
            },
            {
                name: "Rules file path",
                desc: `Path relative to plugin folder (default: rules.json). Full path: ${this.plugin.getFullRulesPath()}`,
                render: (setting) => this._configureRulesPathField(setting),
            },
            {
                name: "Reload rules now",
                desc: "Force reload from the external file and validate JSON",
                render: (setting) => this._configureReloadButton(setting),
            },
            {
                name: "Create / open rules file",
                desc: "Create external rules file if missing and open it in a new tab",
                render: (setting) => this._configureCreateOpenButton(setting),
            },
            {
                name: "Debug logs",
                desc: "Log rule matches and loading to the developer console",
                render: (setting) => this._configureDebugToggle(setting),
            },
            {
                name: "Smart limits",
                desc: "Automatically choose \\int/\\int\\limits when expanding inside $...$ or $$...$$.",
                render: (setting) => this._configureSmartLimitsToggle(setting),
            },
            {
                name: "Maxima converter (beta)",
                desc: "Adds a \"Copy as Maxima\" item to the editor's right-click menu when text is selected. Experimental - conversion logic is not implemented yet.",
                render: (setting) => this._configureMaximaConverterToggle(setting),
            },
            {
                name: "Custom rules editor",
                desc: "Manage overrides and additions on top of the built-in math pack.",
                render: (setting) => {
                    setting.settingEl.empty();
                    setting.settingEl.removeClass("setting-item");
                    this._renderRulesEditor(setting.settingEl);
                },
            },
        ];
    }

    /**
     * Imperative fallback for Obsidian versions older than 1.13.0, where
     * getSettingDefinitions() does not exist and isn't called.
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        this._configureEnabledToggle(new Setting(containerEl));
        this._configureRulesPathField(new Setting(containerEl));
        this._configureReloadButton(new Setting(containerEl));
        this._configureCreateOpenButton(new Setting(containerEl));
        this._configureDebugToggle(new Setting(containerEl));
        this._configureSmartLimitsToggle(new Setting(containerEl));
        this._configureMaximaConverterToggle(new Setting(containerEl));

        this._renderRulesEditor(containerEl);
    }

    private _configureEnabledToggle(setting: Setting): void {
        setting
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
    }

    private _configureRulesPathField(setting: Setting): void {
        setting
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
    }

    private _configureReloadButton(setting: Setting): void {
        setting
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
    }

    private _configureCreateOpenButton(setting: Setting): void {
        setting
            .setName("Create / open rules file")
            .setDesc("Create external rules file if missing and open it in a new tab")
            .addButton((b) =>
                b.setButtonText("Create / open").onClick(async () => {
                    await this.plugin._ensureRulesFile();
                    await this.plugin._openRulesFile();
                })
            );
    }

    private _configureDebugToggle(setting: Setting): void {
        setting
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
    }

    private _configureSmartLimitsToggle(setting: Setting): void {
        setting
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
    }

    private _configureMaximaConverterToggle(setting: Setting): void {
        setting
            .setName("Maxima converter (beta)")
            .setDesc(
                "Adds a \"Copy as Maxima\" item to the editor's right-click menu when text is selected. Experimental - conversion logic is not implemented yet."
            )
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.enableMaximaConverter)
                    .onChange(async (v) => {
                        this.plugin.settings.enableMaximaConverter = v;
                        await this.plugin.saveSettings();
                    })
            );
    }

    private _renderRulesEditor(containerEl: HTMLElement): void {
        new Setting(containerEl).setName("Custom rules editor").setHeading();

        const help = containerEl.createDiv();
        help.setText(
            "Edit your rules below. Use double backslashes \\\\ in triggers/expansions. '|' marks cursor; '{}' places cursor inside the first braces. Give a rule the same trigger as a built-in to override it."
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
                // Only your own additions/overrides are editable here - the rest
                // of the built-in pack is always active and doesn't need listing.
                work = this.plugin._getOverlayRules().map((r) => ({ ...r }));
                this.plugin._workRules = work;
                isDirty = false;
            }

            new Setting(editorEl)
                .setName("Your rules")
                .setDesc("Overrides and additions on top of the built-in pack. This is what actually gets saved to your rules file.")
                .setHeading();

            const list = editorEl.createDiv();
            list.addClass("am-rules-list");

            if (work) {
                work.forEach((rule, idx) => {
                    const searchable = `${rule.trigger} ${rule.expand}`.toLowerCase();
                    if (filter && !searchable.includes(filter)) return;

                    const row = list.createDiv({ cls: "am-rule-row" });

                    const badge = row.createDiv();
                    badge.setText(isBuiltInTrigger(rule) ? "Modified built-in" : "Custom");
                    badge.setAttr("style", "font-size: 0.8em; opacity: .7;");

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

            new Setting(actions)
                .setName("Copy your rules as JSON")
                .setDesc("Copies only your additions/overrides - handy as a backup or to move to another vault.")
                .addButton((b) =>
                    b.setButtonText("Copy").onClick(async () => {
                        const overlay = work ?? [];
                        const text = JSON.stringify(overlay, null, 2);
                        try {
                            await navigator.clipboard.writeText(text);
                            new Notice(`Copied ${overlay.length} rule(s) to clipboard`);
                        } catch (e) {
                            console.error("[Auto Math] clipboard copy failed", e);
                            new Notice("Could not copy to clipboard (see console)");
                        }
                    })
                );

            new Setting(actions)
                .setName("Reset to default math pack")
                .setDesc("Clears all your customisations, restoring the pure built-in pack.")
                .addButton((b) =>
                    b.setButtonText("Reset").onClick(async () => {
                        const ok = await this.plugin._resetToDefaults();
                        this.plugin._workRules = null;
                        work = null;
                        isDirty = false;
                        new Notice(ok ? "Reset to default math pack" : "Failed to reset (see console)");
                        await renderEditor({ reload: true });
                    })
                );

            updateMeta();
        };

        void renderEditor();
    }
}
