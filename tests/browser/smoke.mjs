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
  check("tutorial coach asks to listen at dial 0", /Press Listen/.test(await page.textContent("#coach")));
  check("listen button highlighted", await page.$eval("#listen-btn", (b) => b.classList.contains("hl")));

  await page.click("#listen-btn");
  await page.waitForTimeout(100);
  let log = await page.$$eval("#log li", (l) => l.map((x) => x.textContent));
  check("first listen logged as clear (ideal, Mira, balanced, dial 0)", log.length === 1 && /clear/.test(log[0]), log[0]);
  check("calls left decremented", /7 of 8/.test(await page.$eval("#calls-chip .pips", (e) => e.getAttribute("aria-label"))));
  check("meter moved toward Mira", /Is it Mira\? (9\d%|over 99%)/.test(await page.textContent("#meter")), await page.textContent("#meter"));

  for (let i = 0; i < 4; i++) await page.click("#dial-up");
  check("dial at 4", (await page.$eval("#dial", (d) => d.getAttribute("aria-valuenow"))) === "4");
  check("dial turning is free", /7 of 8/.test(await page.$eval("#calls-chip .pips", (e) => e.getAttribute("aria-label"))));
  await page.click("#listen-btn");
  await page.waitForTimeout(100);
  log = await page.$$eval("#log li", (l) => l.map((x) => x.textContent));
  check("listen at dial 4 is static (destructive interference)", /static/.test(log[0]), log[0]);
  check("coach now asks for a trace", /press Trace/i.test(await page.textContent("#coach")));
  await page.screenshot({ path: path.join(root, "artifacts", "screen_listen.png") });

  await page.click("#trace-btn");
  await page.waitForSelector(".sheet-confirm");
  check("trace asks for confirmation and explains the cost", /coin flip at every dial/.test(await page.textContent(".sheet-confirm")));
  await page.click("#do-trace");
  await page.waitForTimeout(100);
  log = await page.$$eval("#log li", (l) => l.map((x) => x.textContent));
  check("trace logged with a door", /Trace.*(front|side) door/.test(log[0]), log[0]);
  const meter1 = await page.textContent("#meter");
  check("caption announces traced door", /Traced at dial 4/.test(await page.textContent("#caption")));
  await page.screenshot({ path: path.join(root, "artifacts", "screen_trace.png") });

  // keyboard: L listens
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("l");
  await page.waitForTimeout(100);
  check("keyboard L listens and arrows turn the dial", (await page.$$("#log li")).length === 4 && (await page.$eval("#dial", (d) => d.getAttribute("aria-valuenow"))) === "3");
  void meter1;
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
    check(`night ${k}: no tutorial coach`, await page.$eval("#coach", (c) => c.hidden));
    for (let i = 0; i < 3; i++) await page.click("#listen-btn");
    await page.click("#hangup");
    await page.click("#yes");
    await page.waitForSelector(".sheet-result", { timeout: 5000 });
  }
  await page.click("#next");
  await page.waitForSelector(".sheet-ending");
  const end = await page.textContent(".sheet-ending");
  check("ending sheet with score table and data source", /Total/.test(end) && /ideal model/.test(end));
  await page.screenshot({ path: path.join(root, "artifacts", "screen_ending.png") });
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

  // phone-sized layout
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  phone.on("pageerror", (e) => errors.push(String(e)));
  await phone.goto(`http://localhost:${port}/?autostart=screen&seed=7`);
  await phone.waitForSelector(".sheet-intro");
  await phone.tap("#answer");
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
