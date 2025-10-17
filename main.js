
const { Plugin, Notice, Setting } = require("obsidian");

function normalizeText(s) {
  return (s ?? "").replace(/[\u200B\uFEFF]/g, ""); // strip zero-width
}

const DEFAULT_RULES = [
  {
    "trigger": "\\abs",
    "expand": "\\left|{}\\right|"
  },
  {
    "trigger": "\\norm",
    "expand": "\\left\\|{}\\right\\|"
  },
  {
    "trigger": "\\frac",
    "expand": "\\frac{}{}"
  },
  {
    "trigger": "\\text",
    "expand": "\\text{}"
  },
  {
    "trigger": "\\sqrt",
    "expand": "\\sqrt{}"
  },
  {
    "trigger": "\\root",
    "expand": "\\sqrt[]{}"
  },
  {
    "trigger": "\\pow",
    "expand": "{}^{}"
  },
  {
    "trigger": "\\sum",
    "expand": "\\sum_{}^{}"
  },
  {
    "trigger": "\\int",
    "expand": "\\int_{}^{}"
  },
  {
    "trigger": "\\lim",
    "expand": "\\lim_{}"
  },
  {
    "trigger": "\\vec",
    "expand": "\\vec{}"
  },
  {
    "trigger": "\\hat",
    "expand": "\\hat{}"
  },
  {
    "trigger": "\\bar",
    "expand": "\\bar{}"
  },
  {
    "trigger": "\\overline",
    "expand": "\\overline{}"
  },
  {
    "trigger": "\\underline",
    "expand": "\\underline{}"
  },
  {
    "trigger": "\\log",
    "expand": "\\log_{}"
  },
  {
    "trigger": "\\ln",
    "expand": "\\ln{}"
  },
  {
    "trigger": "\\sin",
    "expand": "\\sin{}"
  },
  {
    "trigger": "\\cos",
    "expand": "\\cos{}"
  },
  {
    "trigger": "\\tan",
    "expand": "\\tan{}"
  },
  {
    "trigger": "\\cot",
    "expand": "\\cot{}"
  },
  {
    "trigger": "\\sec",
    "expand": "\\sec{}"
  },
  {
    "trigger": "\\csc",
    "expand": "\\csc{}"
  },
    {
        "trigger": "^^",
        "expand": "^{}"
    },
    {
        "trigger": "__",
        "expand": "_{}"
    }

];

const DEFAULT_SETTINGS = {
  enabled: true,
  rulesPath: ".obsidian/plugins/auto-math/rules.json",

    debug: true,
  rulesJson: JSON.stringify(DEFAULT_RULES, null, 2), // fallback
};

module.exports = class AutoMathPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    console.log("[Auto Math] loaded v0.1.3");

    const exists = await this._rulesFileExists(this.settings.rulesPath);
    new Notice(exists ? `Auto Math: external rules found → ${this.settings.rulesPath}`
                      : `Auto Math: external rules NOT found → using default pack`);

    await this._loadExternalRules(true);
    new Notice(`Auto Math: ${this._getRules().length} active rules`);

    this.statusEl = this.addStatusBarItem();
    this._renderStatus();

    this.addRibbonIcon("divide", "Toggle Auto Math", () => this._toggle());

    this.addCommand({ id: "auto-math-toggle", name: "Toggle Auto Math", callback: () => this._toggle() });
    this.addCommand({ id: "auto-math-reload-rules", name: "Reload Auto Math rules", callback: async () => {
      const ok = await this._loadExternalRules(true);
      new Notice(ok ? `Rules reloaded (${this._getRules().length})` : "Failed to reload rules (see console)");
    }});
    this.addCommand({ id: "auto-math-dump-rules", name: "Dump Auto Math rules to console", callback: () => {
      console.log("[Auto Math] active rules:", this._getRules());
      new Notice(`Dumped ${this._getRules().length} rules to console`);
    }});
    this.addCommand({ id: "auto-math-create-or-open", name: "Create or open rules file", callback: async () => {
      await this._ensureRulesFile();
      await this._openRulesFile();
    }});

    this._registerRulesWatcher();

    this.registerEvent(
      this.app.workspace.on("editor-change", (editor) => {
        if (!this.settings.enabled) return;
        if (!editor) return;
        try { this._maybeExpand(editor); } catch (e) { console.error("[Auto Math] expand error", e); }
      })
    );

    this.addSettingTab(new AutoMathSettingsTab(this.app, this));
  }

  _toggle() {
    this.settings.enabled = !this.settings.enabled;
    this.saveSettings();
    this._renderStatus();
    new Notice(`Auto Math: ${this.settings.enabled ? "ON" : "OFF"}`);
  }

  _renderStatus() {
    if (!this.statusEl) return;
    this.statusEl.setText(this.settings.enabled ? "Auto Math: ON" : "Auto Math: OFF");
  }

  async _rulesFileExists(path) {
    try { return await this.app.vault.adapter.exists(path); } catch (_) { return false; }
  }
  async _readVaultFile(path) {
    try { return await this.app.vault.adapter.read(path); } catch (e) { console.error("[Auto Math] read error", e); return null; }
  }
  async _writeVaultFile(path, text) {
    try { await this.app.vault.adapter.write(path, text); return true; }
    catch (e) { console.error("[Auto Math] write error", e); return false; }
  }
  async _ensureRulesFile() {
    const p = this.settings.rulesPath;
    if (!(await this._rulesFileExists(p))) {
      const def = JSON.stringify(DEFAULT_RULES, null, 2) + "\\n";
      const ok = await this._writeVaultFile(p, def);
      new Notice(ok ? `Created rules file at ${p}` : "Failed to create rules file (see console)");
    }
  }
  async _openRulesFile() {
    const p = this.settings.rulesPath;
    try {
      const file = this.app.vault.getAbstractFileByPath(p);
      if (file) await this.app.workspace.getLeaf(true).openFile(file);
    } catch (e) { console.error("[Auto Math] cannot open rules file", e); }
  }

  async _loadExternalRules(showErrors) {
    const p = this.settings.rulesPath;
    const raw = await this._readVaultFile(p);
    if (raw && raw.trim()) {
      const parsed = this._parseRulesText(raw, showErrors);
      if (parsed && parsed.length) { this._rules = parsed; if (this.settings.debug) console.log("[Auto Math] loaded external rules", parsed); return true; }
      if (showErrors) console.error("[Auto Math] external rules present but invalid at", p);
    } else {
      if (showErrors) console.warn("[Auto Math] external rules missing at", p);
    }
    const fallback = this._parseRulesText(this.settings.rulesJson, showErrors);
    this._rules = Array.isArray(fallback) ? fallback : [];
    if (this.settings.debug) console.log("[Auto Math] loaded fallback rules", this._rules);
    return !!this._rules.length;
  }

  _parseRulesText(text, showErrors) {
    try {
      const trimmed = text.trim();
      if (trimmed.startsWith("[")) {
        const arr = JSON.parse(trimmed);
        return this._sanitizeRules(arr);
      }
      const lines = trimmed.split(/\\n+/).map(l => l.trim()).filter(Boolean);
      const arr = [];
      for (const l of lines) { try { arr.push(JSON.parse(l)); } catch { /* ignore */ } }
      return this._sanitizeRules(arr);
    } catch (e) {
      if (showErrors) console.error("[Auto Math] cannot parse rules", e);
      return null;
    }
  }

  _sanitizeRules(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(r => r && typeof r.trigger === "string" && typeof r.expand === "string")
      .map(r => ({ trigger: normalizeText(r.trigger), expand: r.expand }))
      .sort((a, b) => b.trigger.length - a.trigger.length);
  }

  _registerRulesWatcher() {
    const path = this.settings.rulesPath;
    const onChange = async (file) => {
      if (file && file.path === path) {
        if (this.settings.debug) console.log("[Auto Math] detected change in rules file:", path);
        await this._loadExternalRules(true);
        new Notice(`Auto Math: reloaded (${this._getRules().length})`);
      }
    };
    this.registerEvent(this.app.vault.on("modify", onChange));
    this.registerEvent(this.app.vault.on("create", onChange));
    this.registerEvent(this.app.vault.on("delete", onChange));
  }

  _getRules() { return this._rules || []; }

  _maybeExpand(editor) {
    const cursor = editor.getCursor();
    const lineText = editor.getLine(cursor.line);
    const uptoRaw = lineText.slice(0, cursor.ch);
    const upto = normalizeText(uptoRaw);

    const rules = this._getRules();
    if (!rules.length) return;

    for (const rule of rules) {
      const trig = normalizeText(rule.trigger);
      if (!upto.endsWith(trig)) continue;

      const delta = uptoRaw.length - upto.length;
      const start = cursor.ch - trig.length - delta;
      const before = lineText.slice(0, start);
      const after = lineText.slice(cursor.ch);

      const expanded = rule.expand;
      editor.setLine(cursor.line, before + expanded + after);

      const idxBraces = expanded.indexOf("{}");
      if (idxBraces >= 0) {
        const pos = before.length + expanded.indexOf("{") + 1;
        editor.setCursor({ line: cursor.line, ch: pos });
      } else {
        const pipe = expanded.indexOf("|");
        if (pipe >= 0) {
          editor.setLine(cursor.line, before + expanded.replace("|", "") + after);
          const pos = before.length + pipe;
          editor.setCursor({ line: cursor.line, ch: pos });
        } else {
          editor.setCursor({ line: cursor.line, ch: before.length + expanded.length });
        }
      }

      if (this.settings.debug) console.log("[Auto Math] matched trigger", trig, "expanded to", expanded);
      return;
    }
  }

  async saveSettings() { await this.saveData(this.settings); }
};

class AutoMathSettingsTab extends require("obsidian").PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Auto Math" });

    new Setting(containerEl)
      .setName("Enabled")
      .setDesc("Turn Auto Math on or off.")
      .addToggle(t => t
        .setValue(this.plugin.settings.enabled)
        .onChange(async v => { this.plugin.settings.enabled = v; await this.plugin.saveSettings(); this.plugin._renderStatus(); }));

    new Setting(containerEl)
      .setName("Rules file path")
      .setDesc("Path relative to vault root (default: _auto-math.rules.json)")
      .addText(t => t
        .setValue(this.plugin.settings.rulesPath)
        .onChange(async v => { this.plugin.settings.rulesPath = v.trim() || "_auto-math.rules.json"; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Reload rules now")
      .setDesc("Force reload from the external file and validate JSON")
      .addButton(b => b.setButtonText("Reload").onClick(async () => {
        const ok = await this.plugin._loadExternalRules(true);
        new Notice(ok ? `Rules reloaded (${this.plugin._getRules().length})` : "Failed to reload rules (see console)");
      }));

    new Setting(containerEl)
      .setName("Create / open rules file")
      .setDesc("Create a default rules file if missing and open it in a new tab")
      .addButton(b => b.setButtonText("Create / open").onClick(async () => {
        await this.plugin._ensureRulesFile();
        await this.plugin._openRulesFile();
      }));

    new Setting(containerEl)
      .setName("Debug logs")
      .setDesc("Log rule matches and loading to the developer console")
      .addToggle(t => t
        .setValue(this.plugin.settings.debug)
        .onChange(async v => { this.plugin.settings.debug = v; await this.plugin.saveSettings(); }));

    // --- Custom Rules Editor ---
    containerEl.createEl("h3", { text: "Custom Rules Editor" });
    const help = containerEl.createEl("div");
    help.setText("Edit your rules below. Use double backslashes \\\\ in triggers/expansions. '|' marks cursor; '{}' places cursor inside the first braces.");
    help.setAttr("style", "margin: 6px 0; opacity: .8;");

    const editorEl = containerEl.createDiv();
    let work = this.plugin._workRules || null;

    const renderEditor = async (opts = { reload: false }) => {
      editorEl.empty();

      if (!work || opts.reload) {
        await this.plugin._loadExternalRules(true);
        work = this.plugin._getRules().map(r => ({ ...r }));
        this.plugin._workRules = work;
      }

      const list = editorEl.createDiv();
      list.addClass("am-rules-list");

      work.forEach((rule, idx) => {
        const row = list.createDiv({ cls: "am-rule-row" });
        new Setting(row).setName("Trigger").addText(t => {
          t.setValue(rule.trigger).onChange(v => rule.trigger = v);
        });
        new Setting(row).setName("Expand").addText(t => {
          t.setValue(rule.expand).onChange(v => rule.expand = v);
        });
        new Setting(row).addButton(b => b.setButtonText("Delete").onClick(() => {
          work.splice(idx, 1);
          renderEditor();
        }));
        row.createEl("hr");
      });

      const addWrap = editorEl.createDiv();
      new Setting(addWrap)
        .setName("Add new rule")
        .addButton(b => b.setButtonText("+ Add").onClick(() => {
          work.push({ trigger: "\\\\new", expand: "\\\\new{}" });
          renderEditor();
        }));

      const actions = editorEl.createDiv();
      new Setting(actions)
        .setName("Save rules to file")
        .setDesc(`Writes JSON to ${this.plugin.settings.rulesPath}`)
        .addButton(b => b.setButtonText("Save").onClick(async () => {
          const cleaned = work
            .filter(r => r && typeof r.trigger === "string" && typeof r.expand === "string" && r.trigger.trim().length)
            .sort((a, b) => a.trigger.localeCompare(b.trigger));
          const text = JSON.stringify(cleaned, null, 2) + "\n";
          const ok = await this.plugin._writeVaultFile(this.plugin.settings.rulesPath, text);
          if (ok) {
            this.plugin._workRules = null;
            await this.plugin._loadExternalRules(true);
            new Notice(`Saved ${cleaned.length} rules`);
            renderEditor({ reload: true });
          } else {
            new Notice("Failed to save rules (see console)");
          }
        }))
        .addButton(b => b.setButtonText("Discard").onClick(() => {
          this.plugin._workRules = null;
          work = null;
          new Notice("Changes discarded");
          renderEditor({ reload: true });
        }));
    };

    renderEditor();
  }
}
