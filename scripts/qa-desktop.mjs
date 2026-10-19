// Automated slice of QA-CHECKLIST.md, driven through the DevTools port of a running desktop Obsidian.
//   node scripts/qa-desktop.mjs            (after `make install`)
// Env: AUTO_MATH_PORT (default 9339), AUTO_MATH_VAULT (default A:\BlueProof-dev; any other vault is refused).
// It uses a scratch note and a temporary rules.json and removes both when done.
const port = process.env.AUTO_MATH_PORT ?? '9339';
const vaultPath = process.env.AUTO_MATH_VAULT ?? 'A:\\BlueProof-dev';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(page) {
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((r) => ws.addEventListener('open', r));
	let id = 0;
	const call = (method, params = {}) =>
		new Promise((resolve) => {
			const my = ++id;
			const on = (e) => {
				const m = JSON.parse(e.data);
				if (m.id === my) {
					ws.removeEventListener('message', on);
					resolve(m);
				}
			};
			ws.addEventListener('message', on);
			ws.send(JSON.stringify({ id: my, method, params }));
		});
	const ev = async (expression) => {
		const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
		if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed');
		return r.result?.result?.value;
	};
	return { ws, call, ev };
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
let s = null;
for (const p of targets.filter((t) => t.type === 'page')) {
	const c = await connect(p);
	if ((await c.ev('app.vault.adapter.basePath')) === vaultPath) {
		s = c;
		break;
	}
	c.ws.close();
}
if (!s) {
	console.error(`No window with vault ${vaultPath}; refusing to run`);
	process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
	results.push(ok);
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
};
const typeChar = async (ch) => {
	await s.call('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch });
	await s.call('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
	await sleep(50);
};
const typeText = async (t) => {
	for (const ch of t) await typeChar(ch);
	await sleep(150);
};
const clearDoc = () =>
	s.ev('(()=>{const e=window.__qa.leaf.view.editor;e.cm.dispatch({changes:{from:0,to:e.cm.state.doc.length,insert:""}});e.cm.focus();})()');
const doc = () => s.ev('window.__qa.leaf.view.editor.getValue()');
const cursor = () => s.ev('JSON.stringify(window.__qa.leaf.view.editor.getCursor())');

try {
	if (await s.ev('!!app.vault.getAbstractFileByPath("auto-math-qa-scratch.md")')) throw new Error('scratch note already exists');
	await s.ev(`(async()=>{
		await app.plugins.loadManifests();
		if (app.plugins.enabledPlugins.has("auto-math")) await app.plugins.disablePlugin("auto-math");
		await app.plugins.enablePlugin("auto-math");
		const f = await app.vault.create("auto-math-qa-scratch.md", "");
		const leaf = app.workspace.getLeaf("tab");
		await leaf.openFile(f);
		app.workspace.setActiveLeaf(leaf, { focus: true });
		window.__qa = { f, leaf };
		await new Promise((r) => setTimeout(r, 700));
		leaf.view.editor.cm.focus();
	})()`);
	check('plugin enabled', await s.ev('!!app.plugins.plugins["auto-math"]'));

	// Core behaviour: real key presses, expansion and cursor position
	const cases = [
		['\\frac', '\\frac{}{}', { line: 0, ch: 6 }],
		['\\int', '\\int_{}^{}', { line: 0, ch: 6 }],
		['\\align', '\\begin{align}\n\n\\end{align}', { line: 1, ch: 0 }],
		['\\vmatrix', '\\begin{vmatrix}\n\n\\end{vmatrix}', { line: 1, ch: 0 }],
		['\\Vmatrix', '\\begin{Vmatrix}\n\n\\end{Vmatrix}', { line: 1, ch: 0 }],
	];
	for (const [typed, expected, cur] of cases) {
		await clearDoc();
		await typeText(typed);
		check(`expand ${typed}`, (await doc()) === expected, JSON.stringify(await doc()));
		check(`cursor after ${typed}`, (await cursor()) === JSON.stringify(cur), await cursor());
	}

	// Backspace / paste into a trigger must not expand
	await clearDoc();
	await s.ev('(()=>{const e=window.__qa.leaf.view.editor;e.cm.dispatch({changes:{from:0,insert:"\\\\fracx"},selection:{anchor:6},userEvent:"input.paste"})})()');
	await sleep(250);
	check('paste of \\fracx does not expand', (await doc()) === '\\fracx', JSON.stringify(await doc()));
	await s.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
	await s.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
	await sleep(250);
	check('Backspace into \\frac does not expand', (await doc()) === '\\frac', JSON.stringify(await doc()));

	// Expand on space
	await s.ev('window.__qa.old = app.plugins.plugins["auto-math"].settings.expandOnSpace; app.plugins.plugins["auto-math"].settings.expandOnSpace = true');
	await clearDoc();
	await typeText('\\textbf');
	check('expandOnSpace: \\textbf stays whole', (await doc()) === '\\textbf', JSON.stringify(await doc()));
	await clearDoc();
	await typeText('\\text ');
	check('expandOnSpace: \\text + space expands', (await doc()) === '\\text{}', JSON.stringify(await doc()));
	await s.ev('app.plugins.plugins["auto-math"].settings.expandOnSpace = window.__qa.old');

	// Live reload of the external rules file
	const rulesPath = await s.ev('app.plugins.plugins["auto-math"].getFullRulesPath()');
	const hadRules = await s.ev(`app.vault.adapter.exists(${JSON.stringify(rulesPath)})`);
	const backup = hadRules ? await s.ev(`app.vault.adapter.read(${JSON.stringify(rulesPath)})`) : null;
	await s.ev(`app.vault.adapter.write(${JSON.stringify(rulesPath)}, JSON.stringify([{trigger:"\\\\zzqa",expand:"\\\\zzqa{}"}]))`);
	await sleep(1200);
	check('live reload loads the new rule', await s.ev('app.plugins.plugins["auto-math"]._getRules().some((r) => r.trigger === "\\\\zzqa")'));
	await clearDoc();
	await typeText('\\zzqa');
	check('live reload picks up a new rule', (await doc()) === '\\zzqa{}', JSON.stringify(await doc()));
	if (hadRules) await s.ev(`app.vault.adapter.write(${JSON.stringify(rulesPath)}, ${JSON.stringify(backup)})`);
	else await s.ev(`app.vault.adapter.remove(${JSON.stringify(rulesPath)})`);
	await sleep(1200);

	// Settings tab renders with the new toggle
	const tab = await s.ev(`(async()=>{
		app.setting.open();
		app.setting.openTabById("auto-math");
		await new Promise((r) => setTimeout(r, 600));
		const text = app.setting.activeTab?.containerEl?.textContent ?? "";
		app.setting.close();
		return JSON.stringify({ expandOnSpace: text.includes("Expand on space"), smartLimits: text.includes("Smart limits"), editor: text.includes("Custom rules editor") });
	})()`);
	const t = JSON.parse(tab);
	check('settings tab shows Expand on space', t.expandOnSpace, tab);
	check('settings tab shows the rules editor', t.editor && t.smartLimits, tab);
} catch (e) {
	check('script ran without errors', false, String(e));
} finally {
	await s
		.ev(`(async()=>{try{window.__qa.leaf.detach();await app.fileManager.trashFile(window.__qa.f);}catch(e){} delete window.__qa;})()`)
		.catch(() => {});
	console.log('scratch note removed: ' + (await s.ev('!app.vault.getAbstractFileByPath("auto-math-qa-scratch.md")')));
	s.ws.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
