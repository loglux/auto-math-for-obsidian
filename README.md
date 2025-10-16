## 📐 Auto Math for Obsidian

✍️ **Write equations at the speed of thought — automatic LaTeX snippet expansion for Obsidian.**

Auto Math automatically expands LaTeX-style math snippets while you type in Obsidian.  
It’s like a mini _LaTeX auto-completion engine_ — lightweight, fast, and entirely local.

---

### ✨ Features

- 🔹 **Instant snippet expansion** – type `\frac`, `\sqrt`, `\sum`, etc., and get ready-to-edit templates.
    
- 🔹 **Custom rule file** – all expansions are stored in `_auto-math.rules.json` (in your vault root).
    
- 🔹 **Live reload** – changes in the rules file are applied immediately, no restart required.
    
- 🔹 **Built-in math pack** – includes common LaTeX commands for fractions, roots, sums, limits, etc.
    
- 🔹 **Custom Rules Editor** – edit triggers and expansions directly inside Obsidian settings.
    
- 🔹 **Toggle anytime** – quickly enable or disable with the ribbon icon or command palette.
    
- 🔹 **“Reset to default math pack”** – restore the standard set with one click.
    

---

### 🧮 Default Rule Pack

Auto Math comes preloaded with the following triggers:

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
|`\abs`|`\left|{}\right|'|
|`\norm`|`\left\|{}\right\|`|
|`\vec`|`\vec{}`|
|`\hat`|`\hat{}`|
|`\bar`|`\bar{}`|
|`\overline`|`\overline{}`|
|`\underline`|`\underline{}`|

---

### ⚙️ Installation

#### Manual

1. Download the latest release from the [Releases](https://github.com/loglux/auto-math-for-obsidian/releases/) page.
    
2. Extract the folder `auto-math` into your vault under:
    
    ```
    .obsidian/plugins/auto-math/
    ```
    
3. Enable **Auto Math** in _Settings → Community Plugins → Installed plugins_.
    
4. That’s it — start typing `\frac`, `\sqrt`, `\sum` and watch them expand automatically!
    

---

### 🧰 Configuration

Open **Settings → Auto Math** to customise:

- **Enabled** – toggle Auto Math on/off.
    
- **Rules file path** – defaults to `_auto-math.rules.json`.
    
- **Reload / Create / Open** – reload or open your external rules file.
    
- **Debug logs** – show extra information in the developer console.
    
- **Custom Rules Editor** – view, add, delete, and edit your rules interactively.
    
- **Save rules to file** – writes changes to the JSON file immediately.
    
- **Reset to default math pack** – restores the built-in default rule set.
    

---

### 💡 Customisation Example

If you’d like to add your own expansions, open `_auto-math.rules.json` and add entries like:

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

- The plugin works fully offline and doesn’t require any external dependencies.
    
- Uses plain JSON and Obsidian’s own vault API.
    
- Safe to edit while running — changes are detected automatically.
    

---

### 🧑‍💻 Credits
Released under the MIT licence.
