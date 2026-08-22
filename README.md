## 📐 Auto Math for Obsidian

✍️ **Write equations at the speed of thought — automatic LaTeX snippet expansion for Obsidian.**

Auto Math automatically expands LaTeX-style math snippets while you type in Obsidian.  
It's like a mini _LaTeX auto-completion engine_ — lightweight, fast, and entirely local.

---

### ✨ Features

- 🔹 **Instant snippet expansion** – type `\frac`, `\sqrt`, `\sum`, etc., and get ready-to-edit templates.

- 🔹 **Smart Limits** – optional context‑aware behaviour for ∫ (disabled by default):
    - `$…$` → compact form (`\int_{}^{}`)
    - `$$…$$` → display form with limits (`\int\limits_{}^{}`)

- 🔹 **Multiline templates** – environments like `\align` expand across multiple lines with proper formatting.

- 🔹 **Custom rule file** – your additions and overrides live in `.obsidian/plugins/auto-math/rules.json` (user-editable), layered on top of the built-in pack — you only need to list what you've changed, not the whole pack.

- 🔹 **Live reload** – changes in the rules file are applied immediately, no restart required.

- 🔹 **Built-in math pack** – includes 48 essential LaTeX commands.

- 🔹 **Custom Rules Editor** – edit triggers and expansions directly inside Obsidian settings.

- 🔹 **Toggle anytime** – quickly enable or disable with the ribbon icon or command palette.

---

### 🆚 How Auto Math Differs from Other Plugins

There are several LaTeX-related plugins available for Obsidian. Here's how Auto Math compares:

| Feature | Auto Math | Latex Suite | Quick LaTeX | Completr |
|---------|-----------|-------------|-------------|----------|
| **Approach** | Instant trigger expansion | Snippets + shortcuts | Auto-completion menu | General autocomplete |
| **Triggers** | Standard LaTeX commands | Custom shortcuts | Mixed | Various |
| **Learning curve** | Minimal | Steeper | Moderate | Moderate |
| **Configuration** | Simple JSON file | Complex config | Settings UI | Multiple sources |
| **Focus** | Math snippets only | Full LaTeX workflow | LaTeX shortcuts | All text types |
| **Popup menus** | None | Optional | Yes | Yes |

#### Why choose Auto Math?

1. **No new shortcuts to learn** — Triggers are standard LaTeX commands (`\frac`, `\sqrt`, `\int`). If you know LaTeX, you already know how to use Auto Math. Perfect for beginners learning LaTeX.

2. **Simplicity** — Does one thing well: expand triggers instantly. No menus, no popups, no complex configuration.

3. **Predictability** — Every trigger expands exactly the same way, every time. No magic, no surprises.

4. **Flexibility** — All rules are stored in a simple JSON file. Edit it directly or use the built-in settings editor.

5. **Lightweight** — Zero dependencies, minimal footprint, works entirely offline.

**Best for:** Users who want fast, predictable LaTeX snippet expansion without learning new shortcuts or dealing with complex configuration.

For detailed documentation, tutorials, and examples, visit the **[Auto Math Wiki](https://github.com/loglux/auto-math-for-obsidian/wiki)**.

---

### 🧮 Default Rule Pack

Auto Math v0.2.9 comes preloaded with 48 essential triggers:

#### Basic Commands

|Trigger|Expands to|
|---|---|
|`\frac`|`\frac{}{}`|
|`\dfrac`|`\dfrac{}{}`|
|`\tfrac`|`\tfrac{}{}`|
|`\cfrac`|`\cfrac{}{}`|
|`\binom`|`\binom{}{}`|
|`\dbinom`|`\dbinom{}{}`|
|`\tbinom`|`\tbinom{}{}`|
|`\text`|`\text{}`|
|`\sqrt`|`\sqrt{}`|
|`\root`|`\sqrt[]{}`|
|`\pow`|`{}^{}`|
|`\abs`|`\left\|{}\right\|`|
|`\norm`|`\left\\|{}\right\\|`|
|`\paren`|`\left({}\right)`|
|`\brack`|`\left[{}\right]`|
|`\brace`|`\left\{{}\right\}`|
|`\vec`|`\vec{}`|
|`\hat`|`\hat{}`|
|`\bar`|`\bar{}`|
|`\overline`|`\overline{}`|
|`\underline`|`\underline{}`|
|`\substack`|`\substack{}`|
|`^^`|`^{}`|
|`__`|`_{}`|

#### Sums, Integrals & Limits

|Trigger|Expands to|
|---|---|
|`\sum`|`\sum_{}^{}`|
|`\int`|`\int_{}^{}`|
|`\lim_`|`\lim_{}`|
|`\limsup`|`\limsup_{}`|
|`\liminf`|`\liminf_{}`|
|`\max`|`\max_{}`|
|`\min`|`\min_{}`|
|`\inf_`|`\inf_{}`|
|`\sup`|`\sup_{}`|

#### Logarithms

|Trigger|Expands to|
|---|---|
|`\log`|`\log_{}`|

#### LaTeX Environments

|Trigger|Expands to|Use case|
|---|---|---|
|`\align`|`\begin{align}...\end{align}`|Aligned equations (with numbering)|
|`\aligned`|`\begin{aligned}...\end{aligned}`|Aligned equations (no numbering)|
|`\gather`|`\begin{gather}...\end{gather}`|Centred equations|
|`\cases`|`\begin{cases}...\end{cases}`|Piecewise functions|
|`\array`|`\begin{array}{}...\end{array}`|Custom arrays|
|`\matrix`|`\begin{matrix}...\end{matrix}`|Matrix (no brackets)|
|`\pmatrix`|`\begin{pmatrix}...\end{pmatrix}`|Matrix with ( )|
|`\bmatrix`|`\begin{bmatrix}...\end{bmatrix}`|Matrix with [ ]|
|`\vmatrix`|`\begin{vmatrix}...\end{vmatrix}`|Matrix with \| \| (determinant)|
|`\Vmatrix`|`\begin{Vmatrix}...\end{Vmatrix}`|Matrix with ‖ ‖ (double bars)|
|`\smallmatrix`|`\begin{smallmatrix}...\end{smallmatrix}`|Compact matrix for inline math|
|`\split`|`\begin{split}...\end{split}`|Split equations|
|`\multline`|`\begin{multline}...\end{multline}`|Long equation, first/last line aligned to margins|
|`\alignat`|`\begin{alignat}{}...\end{alignat}`|Aligned equations with explicit column count|

---

### ⚙️ Installation

#### Manual

1. Download the latest release from the [Releases](https://github.com/loglux/auto-math-for-obsidian/releases/) page.

2. Extract the folder `auto-math` into your vault under:

    ```
    .obsidian/plugins/auto-math/
    ```

3. Enable **Auto Math** in _Settings → Community Plugins → Installed plugins_.

4. That's it — start typing `\frac`, `\sqrt`, `\sum` and watch them expand automatically!


---

### 🧰 Configuration

Open **Settings → Auto Math** to customise:

- **Enabled** – toggle Auto Math on/off.

- **Rules file path** – defaults to `.obsidian/plugins/auto-math/rules.json`.

- **Smart Limits** – context‑aware expansions for ∫ (disabled by default, enable in settings if needed).

- **Reload / Create / Open** – reload or open your external rules file.

- **Debug logs** – show extra information in the developer console.

- **Custom Rules Editor** – "Your rules" lists only your own additions/overrides on top of the built-in pack (badged as *Custom* or *Modified built-in*). Give a rule the same trigger as a built-in to override it.

- **Save rules to file** – writes your overlay (not the whole pack) to the JSON file immediately.

- **Copy your rules as JSON** – copies just your overlay to the clipboard, for backup or moving to another vault.

- **Reset to default math pack** – clears all customisations, back to a clean install.

---

### 📐 Multiline Maths Mode

Auto Math now supports Smart Limits in multiline `$$...$$` blocks.

**Example:**
```markdown
$$
\int x dx  ← expands to \int\limits_{}^{}
$$
```

The plugin automatically scans neighbouring lines (up to 50 by default) to detect display maths context.

**Technical note:** The scan depth can be adjusted by modifying `maxScanLines` in the plugin settings file (default: 50 lines). This is stored in `.obsidian/plugins/auto-math/data.json`.

---

## LaTeX Environments

Auto Math includes snippets for common LaTeX environments. These automatically expand into multiline blocks with proper formatting.

### Example Usage

**Input:**
```markdown
$$
\align
$$
```

**Expands to:**
```markdown
$$
\begin{align}
| ← cursor here
\end{align}
$$
```

Then you can write your equations with `\\` for line breaks:
```markdown
$$
\begin{align}
x + y &= 5 \\
x &= 5 - y
\end{align}
$$
```

**Result:**
$$
\begin{align}
x + y &= 5 \\
x &= 5 - y
\end{align}
$$

---

### 💡 Customisation Example

`rules.json` is an **overlay** on top of the built-in pack, not a full replacement — list only what you want to add or change, and every built-in trigger you didn't mention stays active as-is (including any added in a later update).

```json
[
  { "trigger": "\\ceil", "expand": "\\left\\lceil{}\\right\\rceil" },
  { "trigger": "\\floor", "expand": "\\left\\lfloor{}\\right\\rfloor" },
  { "trigger": "\\bmatrix", "expand": "\\begin{bmatrix}\n & \\\\\n\\end{bmatrix}" }
]
```

The `\bmatrix` entry above **overrides** the built-in template (same trigger, different expansion). Adding a new trigger like `\ceil` just extends the pack.

Then click **Reload rules now** — your changes are active instantly.

---

### 🪶 Notes

- The plugin works fully offline and doesn't require any external dependencies.

- Uses plain JSON and Obsidian's own vault API.

- Safe to edit while running — changes are detected automatically.

---

## Documentation

For more details, tips, and extended explanations, check the project Wiki:
https://github.com/loglux/auto-math-for-obsidian/wiki

---

### 🧑‍💻 Credits
Released under the MIT licence.
