// Runs the Qollab page's main.js in desktop Chromium with a MOCKED Qollab
// bridge (import map + stub `backend`). The Python results come from the real
// qollab/qollab_api.py executed with a stub qiskit and a fake backend
// (tests/quantum/test_qollab_api.py). Evidence for the JS/UI wiring only,
// not for Qollab's real runtime.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dir = path.join(root, "build", "qollab_harness");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
cpSync(path.join(root, "qollab"), dir, { recursive: true });

// main.js draws its seed from crypto.getRandomValues; the harness pins it to 4242
const SEED = "04242";
const N = await import(path.join(root, "build/js/packages/core/src/nights.js"));
const nights = JSON.parse(readFileSync(path.join(root, "shared/nights.json"), "utf8"));
const plan = N.planRun(nights, SEED);
const mode = process.argv[2] === "broken" ? "broken" : "ok";
const py = `
import sys, json, os
sys.path.insert(0, ${JSON.stringify(path.join(root, "tests/quantum"))})
import test_qollab_api as t
api = t.load_api()
os.chdir(${JSON.stringify(path.join(root, "qollab"))})
backend = t.BrokenBackend() if ${JSON.stringify(mode)} == "broken" else t.FakeBackend()
print(json.dumps({"nights": api.load_nights(), "run": api.run_calls(backend, ${JSON.stringify(JSON.stringify(plan))}, ${JSON.stringify(SEED)}),
  "c0": api.circuit_text(False), "c1": api.circuit_text(True)}))
`;
const out = JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8" }));
writeFileSync(path.join(dir, "__mock_payload.json"), JSON.stringify(out));
writeFileSync(path.join(dir, "__mock_bridge.js"), `
const payload = await (await fetch("./__mock_payload.json")).json();
export const load_nights = { callPromising: async () => payload.nights };
export const run_calls = { callPromising: async (backend, planJson, seed) => {
  if (planJson !== ${JSON.stringify(JSON.stringify(plan))}) throw new Error("harness plan mismatch: " + planJson);
  return payload.run;
} };
export const circuit_text = { callPromising: async (trace) => (trace ? payload.c1 : payload.c0) };
`);
const body = readFileSync(path.join(dir, "index.html"), "utf8");
writeFileSync(path.join(dir, "harness.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Qollab harness</title>
<link rel="icon" href="data:,"><link rel="stylesheet" href="./main.css">
<script type="importmap">{"imports":{"qollab_api":"./__mock_bridge.js"}}</script>
<script>window.backend = { name: "mock" }; crypto.getRandomValues = (a) => { a[0] = 4242; return a; };</script></head><body>${body}
<script type="module" src="./main.js"></script></body></html>`);

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer((req, res) => {
  const f = path.join(dir, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(dir) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "text/plain" });
  res.end(readFileSync(f));
}).listen(0);
const port = server.address().port;
let ok = true;
const check = (n, c, d = "") => { console.log((c ? "PASS " : "FAIL ") + n + (d ? " — " + d : "")); ok &&= !!c; };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/harness.html`);
  await page.waitForFunction(() => /Done in|did not complete|Error/.test(document.getElementById("run-status").textContent), null, { timeout: 10000 });
  const status = await page.textContent("#run-status");
  if (mode === "broken") {
    check("failed run is reported, not hidden", /did not complete: RuntimeError: batch rejected/.test(status), status);
    await page.waitForSelector(".sheet-intro");
    await page.click("#answer");
    await page.click("#stage-next");
    await page.click("#stage-next");
    await page.click("#listen-btn");
    check("fallback outcomes are labelled as the ideal model, not quantum results", /ideal model/.test(await page.textContent("#caption")));
    check("spoiler data table stays hidden", await page.$eval("#raw-details", (d) => d.hidden));
  } else {
    check("run status names backend, 56 circuits and job", /built-in simulator \(test double\).*56 circuits × 16 shots.*fake-job-1/.test(status), status);
    check("circuit drawings shown", /stub drawing: 2 qubits/.test(await page.textContent("#circuit")));
    check("spoiler data table available but collapsed", !(await page.$eval("#raw-details", (d) => d.hidden || d.open)));
    await page.waitForSelector(".sheet-intro");
    await page.click("#skip"); // free play: this test spends every call
    await page.waitForSelector("#sheet-wrap", { state: "hidden" });
    await page.click("#listen-btn");
    const cap = await page.textContent("#caption");
    check("in-game call uses a measured shot from the backend", /measured shot from built-in simulator \(test double\)/.test(cap), cap);
    check("night 1 dial 0 is clear on the ideal fake backend", /Listened at dial 0: clear line/.test(cap));
    // spend every call at dial 4: every shot comes from the measured bag, all static
    for (let i = 0; i < 4; i++) await page.click("#dial-up");
    for (let i = 0; i < 7; i++) await page.click("#listen-btn");
    const log = await page.$$eval("#log li", (l) => l.map((x) => x.textContent));
    check("all 7 listens at dial 4 are static (destructive interference in measured data)", log.slice(0, 7).every((t) => /dial 4 → static/.test(t)), log.slice(0, 7).join(" | "));
    check("budget exhausted after 8 calls", (await page.$eval("#listen-btn", (b) => b.disabled)));
    await page.screenshot({ path: path.join(root, "artifacts", "qollab_mock.png"), fullPage: false });
    // finish the night; on call 4 the erase calls must replay this run's eraser shots
    await page.click("#hangup"); await page.click("#yes"); await page.waitForSelector(".sheet-result");
    for (let k = 2; k <= 3; k++) { await page.click("#next"); await page.waitForSelector(".sheet-intro"); await page.click("#answer"); await page.click("#hangup"); await page.click("#yes"); await page.waitForSelector(".sheet-result"); }
    await page.click("#next"); await page.waitForSelector(".sheet-intro"); await page.click("#answer");
    await page.waitForSelector("#sheet-wrap", { state: "hidden" });
    check("call 4 on Qollab: trace and erase only", await page.$eval("#listen-btn", (b) => b.hidden) && !(await page.$eval("#erase-btn", (b) => b.hidden)));
    for (let i = 0; i < 6; i++) await page.click("#erase-btn");
    const elog = await page.$$eval("#log li", (l) => l.map((x) => x.textContent));
    check("erased calls come from the measured eraser bag with a + / − reading", elog.slice(0, 6).every((t) => /Erase dial 0 → (clear|static) · eraser read [+−]/.test(t)) && /measured shot|fresh shots/.test(await page.textContent("#caption")), elog.slice(0, 2).join(" | "));
    await page.click("#sort-btn");
    await page.waitForTimeout(100);
    const meter = await page.evaluate(() => ({ html: document.querySelector("#meter").innerHTML, status: document.querySelector("#case-status")?.textContent }));
    check("sorted eraser groups from measured shots move the meter", /Chance it's Mira: <strong>(over 99%|under 1%|\d+%)<\/strong> after 6 sorted erased calls/.test(meter.html), meter.html.replace(/<[^>]+>/g, "").slice(0, 160));
  }
  check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 400));
} finally {
  await browser.close();
  server.close();
}
process.exit(ok ? 0 : 1);
