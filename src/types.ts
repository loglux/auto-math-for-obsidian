/**
 * Rule interface for trigger-expansion pairs
 */
export interface Rule {
    trigger: string;
    expand: string;
}

/**
 * Smart operator with context-aware expansions
 */
export interface SmartOperator {
    inline: string;
    display: string;
}

/**
 * Conflict group for duplicate trigger resolution
 */
export interface ConflictGroup {
    key: string;
    trigger: string;
    options: Rule[];
    defaultIndex: number;
}

/**
 * Math context detection result
 */
export interface MathContext {
    type: "inline" | "display" | "none";
}

/**
 * Plugin settings interface
 */
export interface AutoMathSettings {
    enabled: boolean;
    rulesPath: string;
    debug: boolean;
    smartLimits: boolean;
    maxScanLines: number;
    /**
     * Experimental: adds a "Copy as Maxima" item to the editor context menu
     * for the current selection. Off by default.
     */
    enableMaximaConverter: boolean;
    /**
     * User-only rule additions/overrides, layered on top of the built-in
     * DEFAULT_RULES pack at runtime. Does NOT contain a copy of the
     * built-ins, so newly added built-in triggers always show up for
     * everyone without any migration step.
     */
    userRulesJson: string;
}
