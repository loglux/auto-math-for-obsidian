import { App, Notice, Setting, PluginSettingTab } from "obsidian";
import type { Rule, ConflictGroup } from "./types";
import { normalizeText } from "./utils";
import { resolveRuleConflicts } from "./modals";
import type AutoMathPlugin from "./plugin";

export class AutoMathSettingsTab extends PluginSettingTab {
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
