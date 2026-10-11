// Browser smoke test (desktop Chromium via Playwright). Not evidence of mobile AR.
//   node tests/browser/smoke.mjs            (after npm run build)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
mkdirSync(path.join(root, "artifacts"), { recursive: true });
const port = 8000 + Math.floor(Math.random() * 900);
const server = spawn(process.execPath, [path.join(root, "scripts/serve.mjs")], { env: { ...process.env, PORT: String(port) }, stdio: "pipe" });
await new Promise((r) => setTimeout(r, 600));

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : ""));
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/?seed=4242`);
  await page.waitForSelector("#start-form");
  check("start screen renders", true);
  check("attribution line present", (await page.content()).includes("This effort is supported by Qollab &amp; IonQ"));
  check("WebXR button disabled when unsupported (desktop Chromium)", await page.$eval('button[data-mode="xr"]', (b) => b.disabled));
  await page.screenshot({ path: path.join(root, "artifacts", "start_screen.png") });

  await page.click('button[data-mode="screen"]');
  await page.waitForSelector(".sheet-intro");
  check("night 1 intro sheet shown", /The first call/.test(await page.textContent(".sheet-intro")));
  await page.click("#answer");
  await page.waitForSelector("#sheet-wrap", { state: "hidden" });
  const guide = () => page.textContent("#guide-card");
  check("walkthrough step 1 explains how to win (WHO and WHERE)", /WHO/.test(await guide()) && /WHERE/.test(await guide()));
  check("stepper shows 7 stages", (await page.$$("#stepper li")).length === 7);
  check("step 1 gates the controls (listen disabled)", await page.$eval("#listen-btn", (b) => b.disabled));
  await page.click("#stage-next");
  check("step 2 explains superposition", /Superposition/.test(await guide()));
  await page.click("#stage-next");
  check("step 3 asks to listen at dial 0; trace still locked", /press <strong>Listen<\/strong>|press Listen/i.test(await page.innerHTML("#guide-card")) && await page.$eval("#trace-btn", (b) => b.disabled));
  check("listen button highlighted", await page.$eval("#listen-btn", (b) => b.classList.contains("hl")));

  await page.click("#listen-btn");
  await page.waitForTimeout(100);
  let log = await page.$$eval("#log li", (l) => l.map((x) => x.textContent));
  check("first listen logged as clear (ideal, Mira, balanced, dial 0)", log.length === 1 && /clear/.test(log[0]), log[0]);
  check("guide explains the result with both voiceprints", /Mira comes through clear over 99%/.test(await guide()));
  check("narrator reacts to the result actually received (clear at dial 0)", /Clear\. Her voice came through both doors in step/.test(await page.textContent("#guide-card .narr")));
  check("walkthrough offers a replay of the narrator", !!(await page.$("#stage-replay")));
  check("calls left decremented", /7 of 8/.test(await page.$eval("#calls-chip .pips", (e) => e.getAttribute("aria-label"))));
  check("WHO meter moved toward Mira", /Chance it's Mira: (9\d%|over 99%)/.test(await page.textContent("#meter")), await page.textContent("#meter"));
  await page.click("#stage-next");
  check("step 4 explains interference", /Interference/.test(await guide()));

  for (let i = 0; i < 4; i++) await page.click("#dial-up");
  check("dial at 4", (await page.$eval("#dial", (d) => d.getAttribute("aria-valuenow"))) === "4");
  check("dial turning is free", /7 of 8/.test(await page.$eval("#calls-chip .pips", (e) => e.getAttribute("aria-label"))));
  await page.click("#listen-btn");
  await page.waitForTimeout(100);
  log = await page.$$eval("#log li", (l) => l.map((x) => x.textContent));
  check("listen at dial 4 is static (destructive interference)", /static/.test(log[0]), log[0]);
  await page.screenshot({ path: path.join(root, "artifacts", "screen_listen.png") });
  await page.click("#stage-next");
  check("step 5 introduces the voiceprint", /voiceprint/.test(await guide()));
  await page.click("#stage-next");
  check("step 6 asks to trace; listen now locked", /Trace/.test(await guide()) && await page.$eval("#listen-btn", (b) => b.disabled));

  await page.click("#trace-btn");
  await page.waitForSelector(".sheet-confirm");
  check("trace asks for confirmation and explains the cost", /coin flip at every dial/.test(await page.textContent(".sheet-confirm")));
  await page.click("#do-trace");
  await page.waitForTimeout(100);
  log = await page.$$eval("#log li", (l) => l.map((x) => x.textContent));
  check("trace logged with a door", /Trace.*(front|side) door/.test(log[0]), log[0]);
  check("caption announces traced door", /Traced at dial 4/.test(await page.textContent("#caption")));
  check("guide explains measurement destroys interference", /destroys interference/.test(await guide()));
  await page.screenshot({ path: path.join(root, "artifacts", "screen_trace.png") });
  await page.click("#stage-next");
  check("step 7: decide, all controls unlocked", /Decide/.test(await guide()) && !(await page.$eval("#open-front", (b) => b.disabled)) && !(await page.$eval("#listen-btn", (b) => b.disabled)));

  const clipSecs = await page.evaluate(async () => { const a = window.__lastCall.audio; a.unlock(); const b = await a["clip"]("clear_0"); return b ? b.duration : 0; });
  check("recorded neural voice clip decodes in the browser", clipSecs > 1, clipSecs.toFixed(2) + " s");
  // keyboard: L listens
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("l");
  await page.waitForTimeout(100);
  check("keyboard L listens and arrows turn the dial", (await page.$$("#log li")).length === 4 && (await page.$eval("#dial", (d) => d.getAttribute("aria-valuenow"))) === "3");
  // focused dial: one arrow press = one step; held keys and Ctrl+L never spend calls
  await page.focus("#dial");
  await page.keyboard.press("ArrowRight");
  check("one arrow key moves the focused dial one step", (await page.$eval("#dial", (d) => d.getAttribute("aria-valuenow"))) === "4");
  const before = (await page.$$("#log li")).length;
  await page.keyboard.press("Control+l");
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "l", repeat: true, bubbles: true })));
  check("modifier and auto-repeat keys don't make calls", (await page.$$("#log li")).length === before);

  await page.click("#open-front");
  await page.waitForSelector(".sheet-confirm");
  await page.click("#yes");
  await page.waitForSelector(".sheet-result", { timeout: 5000 });
  const res = await page.textContent(".sheet-result");
  check("night 1 result: Mira saved through either door", /It was Mira/.test(res) && /\+1\d\d/.test(res), res.slice(0, 120));
  await page.screenshot({ path: path.join(root, "artifacts", "screen_result.png") });
  // Settings over the result sheet, then Escape: the result (and its Next button) must come back
  await page.evaluate(() => document.getElementById("settings-btn").inert = false); // header is inert under a sheet; force-open via code path
  await page.evaluate(() => window.__lastCall.ui["showSettings"]());
  await page.keyboard.press("Escape");
  check("closing Settings restores the result sheet underneath", !!(await page.$(".sheet-result #next")));

  // play the remaining nights: hang up each time
  for (let k = 2; k <= 4; k++) {
    await page.click("#next");
    await page.waitForSelector(".sheet-intro");
    check(`night ${k} intro`, new RegExp(`Call ${k} of 4`).test(await page.textContent(".sheet-intro")));
    await page.click("#answer");
    await page.waitForSelector("#sheet-wrap", { state: "hidden" });
    check(`night ${k}: guide shows the goal checklist, no stepper`, /WHO is calling\?/.test(await page.textContent("#guide-card")) && await page.$eval("#stepper", (c) => c.hidden));
    check(`night ${k}: plain status before any evidence`, /WHO: unknown, no listens yet/.test(await page.textContent("#case-status")) && /calls left/.test(await page.textContent("#case-status")) && /Decide now/.test(await page.textContent("#case-status")));
    for (let i = 0; i < 3; i++) await page.click("#listen-btn");
    const stat = await page.textContent("#case-status");
    check(`night ${k}: status states the evidence without certainty words it hasn't earned`, /(Almost certainly Mira|Mira likely|Caller still unclear|Impostor likely|Almost certainly the impostor)/.test(stat) && !/\b(is Mira|definitely)\b/.test(stat), stat);
    if (k === 2) {
      await page.evaluate(() => { const u = window.__lastCall.ui; u.lastActive = performance.now() - 30000; u.lastHesitate = -1e9; });
      await page.waitForTimeout(1300);
      const toast = await page.textContent("#toast");
      check("hesitating: the caller speaks through the door, marked as not evidence", /Through the door: .*not on the line, not evidence/.test(toast), toast + JSON.stringify(await page.evaluate(() => { const u = window.__lastCall.ui; return { la: performance.now() - u.lastActive, lh: performance.now() - u.lastHesitate, tut: u.tutorial, res: u.c.state.night.result }; })));
    }
    if (k === 3) {
      check("after a listen the guide explains it in game and quantum terms", /What just happened/.test(await page.textContent("#guide-card")) && /Quantum/i.test(await page.textContent("#guide-card")));
      await page.screenshot({ path: path.join(root, "artifacts", "screen_case.png") });
    }
    await page.click("#hangup");
    await page.click("#yes");
    await page.waitForSelector(".sheet-result", { timeout: 5000 });
    const rs = await page.textContent(".sheet-result");
    if (/It was Mira/.test(rs)) check(`night ${k}: a wrong hang-up explains what happened and a better plan`, /a better plan/.test(rs), rs.slice(0, 200));
    else check(`night ${k}: a right call shows no loss advice`, !/a better plan/.test(rs));
  }
  await page.click("#next");
  await page.waitForSelector(".sheet-ending");
  const end = await page.textContent(".sheet-ending");
  check("ending sheet with score table and data source", /Total/.test(end) && /ideal model/.test(end));
  await page.screenshot({ path: path.join(root, "artifacts", "screen_ending.png") });
  // bonus: the quantum eraser
  check("ending offers the bonus eraser scene", !!(await page.$("#bonus")));
  await page.click("#bonus");
  await page.waitForSelector(".bonus #b-sweep");
  check("bonus step 1 asks to sweep; decisions locked", /Sweep all dials/.test(await page.textContent("#b-card")) && await page.$eval("#b-front", (b) => b.disabled));
  await page.click("#b-sweep");
  check("after a traced sweep the guide explains it is flat and asks to sort", /Sort by the eraser/.test(await page.textContent("#b-card")));
  await page.screenshot({ path: path.join(root, "artifacts", "bonus_flat.png") });
  await page.click("#b-sort");
  check("sorting reveals two groups and unlocks the decision", /\+ group/.test(await page.textContent("#b-chart")) && !(await page.$eval("#b-hang", (b) => b.disabled)));
  check("meter uses the sorted groups", /Chance it's Mira from the sorted groups/.test(await page.textContent("#b-meter")));
  await page.screenshot({ path: path.join(root, "artifacts", "bonus_sorted.png") });
  const mira = /Chance it's Mira from the sorted groups: <strong>(over 99%|9\d%)/.test(await page.innerHTML("#b-meter"));
  await page.click(mira ? "#b-front" : "#b-hang");
  await page.waitForTimeout(300);
  check("bonus decision resolves with a result", /You chose right|Wrong call/.test(await page.textContent("#b-card")));
  await page.click("#b-done");
  await page.waitForSelector("#start-form");
  await page.goto(`http://localhost:${port}/?seed=4242`);
  await page.waitForSelector("#start-form");
  await page.click('button[data-mode="screen"]');
  await page.waitForSelector(".sheet-intro");
  await page.click("#skip");
  await page.waitForSelector("#sheet-wrap", { state: "hidden" });
  check("Skip walkthrough: no stepper, goal checklist, all controls free", await page.$eval("#stepper", (e) => e.hidden) && /WHO is calling\?/.test(await page.textContent("#guide-card")) && !(await page.$eval("#trace-btn", (b) => b.disabled)));
  for (let i = 0; i < 1; i++) await page.click("#hangup");
  await page.click("#yes");
  await page.waitForSelector(".sheet-result");
  check("hanging up on Mira without listening says why and what to do instead", /hung up without listening/.test(await page.textContent(".sheet-result")));
  for (let k = 2; k <= 4; k++) { await page.click("#next"); await page.waitForSelector(".sheet-intro"); await page.click("#answer"); await page.click("#hangup"); await page.click("#yes"); await page.waitForSelector(".sheet-result"); }
  await page.click("#next");
  await page.waitForSelector(".sheet-ending");
  await page.click("#how2");
  check("how-it-works explains trace vs listen", /destroys the interference/.test(await page.textContent(".sheet-how")));
  await page.click("#close");
  await page.waitForSelector(".sheet-ending");
  await page.click("#exit2");
  await page.waitForSelector("#start-form");
  check("exit returns to start", true);

  // seed in the URL is never interpreted as HTML
  const x = await browser.newPage();
  let alerted = false;
  x.on("dialog", async (d) => { alerted = true; await d.dismiss(); });
  await x.goto(`http://localhost:${port}/?seed=%22%3E%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E`);
  await x.waitForSelector("#start-form");
  await x.waitForTimeout(300);
  check("seed URL parameter cannot inject HTML", !alerted && !(await x.$("img")));

  // the walkthrough can't be soft-locked by spending calls early
  const w = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  w.on("pageerror", (e) => errors.push(String(e)));
  await w.goto(`http://localhost:${port}/?autostart=screen&seed=5`);
  await w.waitForSelector(".sheet-intro");
  await w.click("#answer");
  await w.click("#stage-next");
  await w.click("#stage-next");
  for (let i = 0; i < 10; i++) await w.keyboard.press("l");
  const left = await w.$eval("#calls-chip .pips", (e) => e.getAttribute("aria-label"));
  check("walkthrough keeps the calls the remaining steps need", /^2 of 8$/.test(left), left);
  await w.click("#stage-next");
  for (let i = 0; i < 4; i++) await w.click("#dial-up");
  await w.click("#listen-btn");
  await w.click("#stage-next");
  await w.click("#stage-next");
  await w.click("#trace-btn");
  await w.click("#do-trace");
  await w.waitForTimeout(100);
  if (await w.$("#stage-next")) await w.click("#stage-next"); // out of calls jumps straight to the decision
  check("…and still reaches the decision", !(await w.$eval("#open-front", (b) => b.disabled)));
  await w.close();

  // phone-sized layout
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  phone.on("pageerror", (e) => errors.push(String(e)));
  await phone.goto(`http://localhost:${port}/?autostart=screen&seed=7`);
  await phone.waitForSelector(".sheet-intro");
  await phone.tap("#answer");
  await phone.tap("#stage-next");
  await phone.tap("#stage-next");
  await phone.tap("#listen-btn");
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("phone layout has no horizontal scroll", !overflow);
  await phone.screenshot({ path: path.join(root, "artifacts", "screen_phone.png"), fullPage: true });

  check("no page errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures ? 1 : 0);
