/**
 * Minimal runtime stand-in for the "obsidian" package.
 * The real package ships type declarations only (no JS at runtime),
 * so tests need a lightweight mock for the pieces AutoMathPlugin touches directly.
 */

export class Plugin {
    app: unknown;
    manifest: unknown;

    constructor(app?: unknown, manifest?: unknown) {
        this.app = app;
        this.manifest = manifest;
    }

    addStatusBarItem(): unknown {
        return { setText: () => undefined };
    }

    addRibbonIcon(): unknown {
        return undefined;
    }

    addCommand(): void {
        return undefined;
    }

    addSettingTab(): void {
        return undefined;
    }

    registerEvent(): void {
        return undefined;
    }

    async loadData(): Promise<unknown> {
        return null;
    }

    async saveData(): Promise<void> {
        return undefined;
    }
}

export class Notice {
    constructor(_message?: string) {
        // no-op in tests
    }
}

export class TFile {
    path = "";
}

export class App {}

export class Setting {
    constructor(_containerEl?: unknown) {
        // no-op in tests
    }
}

export class PluginSettingTab {
    app: unknown;
    plugin: unknown;

    constructor(app?: unknown, plugin?: unknown) {
        this.app = app;
        this.plugin = plugin;
    }
}

export class Modal {
    app: unknown;

    constructor(app?: unknown) {
        this.app = app;
    }
}
