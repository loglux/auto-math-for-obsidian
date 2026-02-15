import { App, Modal, Setting } from "obsidian";
import type { Rule, ConflictGroup } from "./types";

/**
 * Modal for resolving duplicate trigger conflicts
 */
export class ConflictResolutionModal extends Modal {
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

/**
 * Helper function to open conflict resolution modal and wait for result
 */
export function resolveRuleConflicts(app: App, groups: ConflictGroup[]): Promise<Map<string, Rule> | null> {
    const modal = new ConflictResolutionModal(app, groups);
    return modal.openAndWait();
}
