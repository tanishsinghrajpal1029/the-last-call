// Screenshot for the write-up: call 4 after erasing across several dials and sorting.
//   node scripts/shot_eraser.mjs [seed]     (after npm run build)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seed = process.argv[2] || "4242";
const port = 8000 + Math.floor(Math.random() * 900);
const server = spawn(process.execPath, [path.join(root, "scripts/serve.mjs")], { env: { ...process.env, PORT: String(port) }, stdio: "pipe" });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 }, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${port}/?seed=${seed}`);
  await page.waitForSelector("#start-form");
  await page.click('button[data-mode="screen"]');
  await page.waitForSelector(".sheet-intro"); await page.click("#answer");
  await page.waitForSelector("#sheet-wrap", { state: "hidden" });
  await page.click("#stage-next"); await page.click("#stage-next");
  await page.click("#listen-btn"); await page.click("#stage-next");
  for (let i = 0; i < 4; i++) await page.click("#dial-up");
  await page.click("#listen-btn"); await page.click("#stage-next"); await page.click("#stage-next");
  await page.click("#trace-btn"); await page.click("#do-trace"); await page.click("#stage-next");
  await page.click("#open-front"); await page.click("#yes");
  await page.waitForSelector(".sheet-result");
  for (let k = 2; k <= 3; k++) {
    await page.click("#next"); await page.waitForSelector(".sheet-intro"); await page.click("#answer");
    await page.waitForSelector("#sheet-wrap", { state: "hidden" });
    await page.click("#listen-btn");
    await page.click("#hangup"); await page.click("#yes"); await page.waitForSelector(".sheet-result");
  }
  await page.click("#next"); await page.waitForSelector(".sheet-intro"); await page.click("#answer");
  await page.waitForSelector("#sheet-wrap", { state: "hidden" });
  const setDial = async (d) => {
    let cur = Number(await page.$eval("#dial", (e) => e.getAttribute("aria-valuenow")));
    while (cur !== d) { await page.click(d > cur ? "#dial-up" : "#dial-down"); cur = Number(await page.$eval("#dial", (e) => e.getAttribute("aria-valuenow"))); }
  };
  for (const d of [0, 0, 0, 2, 2, 4, 4, 4, 6, 6]) { await setDial(d); await page.click("#erase-btn"); await page.waitForTimeout(60); }
  await page.click("#sort-btn");
  await page.waitForTimeout(300);
  const truth = await page.evaluate(() => { const c = window.__lastCall.controller; return JSON.stringify(c.game?.night?.caller ?? c.state?.caller ?? null); }).catch(() => "?");
  console.log("meter:", (await page.textContent("#meter")).trim().slice(0, 120), "| caller:", truth);
  await page.locator("#casefile").screenshot({ path: path.join(root, "artifacts", "screen_eraser_sorted.png") });
} finally { await browser.close(); server.kill(); }
