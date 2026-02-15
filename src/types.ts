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
    rulesJson: string;
}
