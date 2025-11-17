## 📐 Auto Math for Obsidian

✍️ **Write equations at the speed of thought — automatic LaTeX snippet expansion for Obsidian.**

Auto Math automatically expands LaTeX-style math snippets while you type in Obsidian.  
It's like a mini _LaTeX auto-completion engine_ — lightweight, fast, and entirely local.

---

### ✨ Features

- 🔹 **Instant snippet expansion** – type `\frac`, `\sqrt`, `\sum`, etc., and get ready-to-edit templates.

- 🔹 **Smart Limits** – optional context‑aware behaviour for ∫ and ∑:
    - `$…$` → compact form (`\int_{}^{}`, `\sum_{}^{}`)
    - `$$…$$` → display form with limits (`\int\limits_{}^{}`, `\sum\limits_{}^{}`)

- 🔹 **Multiline templates** – environments like `\align` expand across multiple lines with proper formatting.

- 🔹 **Custom rule file** – all expansions are stored in `.obsidian/plugins/auto-math/rules.json` (user-editable).

- 🔹 **Live reload** – changes in the rules file are applied immediately, no restart required.

- 🔹 **Built-in math pack** – includes common LaTeX commands for fractions, roots, sums, limits, etc.

- 🔹 **Custom Rules Editor** – edit triggers and expansions directly inside Obsidian settings.

- 🔹 **Toggle anytime** – quickly enable or disable with the ribbon icon or command palette.

---

### 🧮 Default Rule Pack

Auto Math comes preloaded with the following triggers:

#### Basic Commands

|Trigger|Expands to|
|---|---|
|`\frac`|`\frac{}{}`|
|`\text`|`\text{}`|
|`\sqrt`|`\sqrt{}`|
|`\root`|`\sqrt[]{}`|
|`\pow`|`{}^{}`|
|`\sum`|`\sum_{}^{}`|
|`\int`|`\int_{}^{}`|
|`\lim`|`\lim_{}`|
|`\abs`|`\left\|{}\right\|`|
|`\norm`|`\left\\|{}\right\\|`|
|`\vec`|`\vec{}`|
|`\hat`|`\hat{}`|
|`\bar`|`\bar{}`|
|`\overline`|`\overline{}`|
|`\underline`|`\underline{}`|
|`\log`|`\log_{}`|
|`\ln`|`\ln{}`|
|`\sin`|`\sin{}`|
|`\cos`|`\cos{}`|
|`\tan`|`\tan{}`|
|`\cot`|`\cot{}`|
|`\sec`|`\sec{}`|
|`\csc`|`\csc{}`|
|`^^`|`^{}`|
|`__`|`_{}`|

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
|`\split`|`\begin{split}...\end{split}`|Split equations|

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

- **Rules file path** – defaults to `.obsidian/plugins/auto-math/auto-math.rules.json`.

- **Smart Limits** – context‑aware expansions for ∫ and ∑.

- **Reload / Create / Open** – reload or open your external rules file.

- **Debug logs** – show extra information in the developer console.

- **Custom Rules Editor** – view, add, delete, and edit your rules interactively.

- **Save rules to file** – writes changes to the JSON file immediately.

- **Reset to default math pack** – restores the built-in default rule set.

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

If you'd like to add your own expansions, open `auto-math.rules.json` and add entries like:

```json
[
  { "trigger": "\\ceil", "expand": "\\left\\lceil{}\\right\\rceil" },
  { "trigger": "\\floor", "expand": "\\left\\lfloor{}\\right\\rfloor" },
  { "trigger": "\\bmatrix", "expand": "\\begin{bmatrix}\n & \\\\\n\\end{bmatrix}" }
]
```

Then click **Reload rules now** — your new triggers will be active instantly.

---

### 🪶 Notes

- The plugin works fully offline and doesn't require any external dependencies.

- Uses plain JSON and Obsidian's own vault API.

- Safe to edit while running — changes are detected automatically.


---

### 🧑‍💻 Credits
Released under the MIT licence.