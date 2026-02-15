import type { SmartOperator, AutoMathSettings } from "./types";
import { DEFAULT_RULES } from "./rules";

/**
 * Smart limit operators
 * These operators switch between inline and display variants.
 * inline -> compact form
 * display -> operator with \limits for top/bottom indices
 */
export const SMART_LIMIT_OPERATORS: Record<string, SmartOperator> = {
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

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: AutoMathSettings = {
    enabled: true,
    rulesPath: "rules.json",
    debug: false,
    smartLimits: false, // disabled by default - enable in settings if needed
    maxScanLines: 50, // maximum lines to scan for multiline $$...$$ blocks
    rulesJson: JSON.stringify(DEFAULT_RULES, null, 2),
};
