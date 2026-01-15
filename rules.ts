export interface Rule {
    trigger: string;
    expand: string;
}

// Default snippet rules (fallback if the external file is missing or invalid)
export const DEFAULT_RULES: Rule[] = [
    { trigger: "\\abs",       expand: "\\left|{}\\right|" },
    { trigger: "\\norm",      expand: "\\left\\|{}\\right\\|" },
    // Fractions frac, dfrac, tfrac, cfrac
    { trigger: "\\frac",      expand: "\\frac{}{}" },
    { trigger: "\\dfrac",     expand: "\\dfrac{}{}" },
    { trigger: "\\tfrac",     expand: "\\tfrac{}{}" },
    { trigger: "\\cfrac",     expand: "\\cfrac{}{}" },
    // Binomial coefficients binom, dbinom, tbinom, cbinom
    { trigger: "\\binom",     expand: "\\binom{}{}" },
    { trigger: "\\dbinom",    expand: "\\dbinom{}{}" },
    { trigger: "\\tbinom",    expand: "\\tbinom{}{}" },
    { trigger: "\\text",      expand: "\\text{}" },
    { trigger: "\\sqrt",      expand: "\\sqrt{}" },
    { trigger: "\\root",      expand: "\\sqrt[]{}" },
    { trigger: "\\pow",       expand: "{}^{}" },
    { trigger: "\\sum",       expand: "\\sum_{}^{}" },
    { trigger: "\\int",       expand: "\\int_{}^{}" },
    // Limits & Bounds
    { trigger: "\\lim_",      expand: "\\lim_{}" },
    { trigger: "\\limsup",    expand: "\\limsup_{}" },
    { trigger: "\\liminf",    expand: "\\liminf_{}" },
    { trigger: "\\max",       expand: "\\max_{}" },
    { trigger: "\\min",       expand: "\\min_{}" },
    { trigger: "\\inf_",      expand: "\\inf_{}" },
    { trigger: "\\sup",       expand: "\\sup_{}" },
    { trigger: "\\vec",       expand: "\\vec{}" },
    { trigger: "\\hat",       expand: "\\hat{}" },
    { trigger: "\\bar",       expand: "\\bar{}" },
    { trigger: "\\overline",  expand: "\\overline{}" },
    { trigger: "\\underline", expand: "\\underline{}" },
    { trigger: "\\log",       expand: "\\log_{}" },
    { trigger: "^^",          expand: "^{}" },
    { trigger: "__",          expand: "_{}" },
    // LaTeX environments (multiline)
    { trigger: "\\align",     expand: "\\begin{align}\n|\n\\end{align}" },
    { trigger: "\\aligned",   expand: "\\begin{aligned}\n|\n\\end{aligned}" },
    { trigger: "\\gather",    expand: "\\begin{gather}\n|\n\\end{gather}" },
    { trigger: "\\cases",     expand: "\\begin{cases}\n|\n\\end{cases}" },
    { trigger: "\\array",     expand: "\\begin{array}{}\n|\n\\end{array}" },
    { trigger: "\\matrix",    expand: "\\begin{matrix}\n|\n\\end{matrix}" },
    { trigger: "\\pmatrix",   expand: "\\begin{pmatrix}\n|\n\\end{pmatrix}" },
    { trigger: "\\bmatrix",   expand: "\\begin{bmatrix}\n|\n\\end{bmatrix}" },
    { trigger: "\\split",     expand: "\\begin{split}\n|\n\\end{split}" },
];
