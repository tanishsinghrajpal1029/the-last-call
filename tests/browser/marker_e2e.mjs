// End-to-end marker AR in desktop Chromium with a synthetic fake camera.
// Evidence that the pipeline runs in a browser; NOT evidence for a phone.
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const y4m = path.join(root, "build", "fake_camera.y4m");
execFileSync(process.execPath, [path.join(root, "tests/browser/make_fake_camera.mjs"), y4m], { stdio: "inherit" });
const port = 8000 + Math.floor(Math.random() * 900);
const server = spawn(process.execPath, [path.join(root, "scripts/serve.mjs")], { env: { ...process.env, PORT: String(port) }, stdio: "pipe" });
await new Promise((r) => setTimeout(r, 600));
let ok = true;
const check = (n, c, d = "") => { console.log((c ? "PASS " : "FAIL ") + n + (d ? " — " + d : "")); ok &&= !!c; };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`, "--use-gl=angle", "--use-angle=swiftshader"],
});
try {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 480 }, permissions: ["camera"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/?seed=99&glread=1`);
  await page.waitForSelector("#start-form");
  check("marker button enabled on localhost with a camera", !(await page.$eval('button[data-mode="marker"]', (b) => b.disabled)));
  await page.click('button[data-mode="marker"]');
  await page.waitForSelector(".marker-view canvas");
  await page.waitForSelector(".sheet-intro");
  await page.click("#answer");
  await page.waitForFunction(() => window.__lastCall?.view?.tracking === true, null, { timeout: 15000 }).catch(() => {});
  check("marker tracked in the fake camera stream", await page.evaluate(() => window.__lastCall?.view?.tracking === true));
  const status = await page.$eval(".xr-status", (e) => (e.hidden ? "" : e.textContent));
  check("no lost-marker status while tracking", status === "", status);
  // the house is drawn: sample the WebGL canvas for non-transparent pixels near the centre
  await page.waitForTimeout(300);
  const drawn = await page.evaluate(() => {
    const c = document.querySelector(".marker-view canvas");
    const tmp = document.createElement("canvas");
    tmp.width = c.width; tmp.height = c.height;
    const g = tmp.getContext("2d");
    g.drawImage(c, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 40) n++;
    return n;
  });
  check("3D house rendered over the camera", drawn > 500, String(drawn));
  await page.click("#listen-btn");
  await page.waitForTimeout(200);
  check("listen works from the AR overlay", (await page.$$("#log li")).length === 1);
  await page.screenshot({ path: path.join(root, "artifacts", "marker_fake_camera.png") });
  // exit and re-enter three times: no stale views or errors
  for (let k = 0; k < 3; k++) {
    await page.click("#exit-btn");
    await page.waitForSelector("#start-form");
    await page.click('button[data-mode="marker"]');
    await page.waitForSelector(".marker-view canvas");
    await page.waitForSelector(".sheet-intro");
    await page.click("#answer");
    await page.waitForTimeout(300);
  }
  check("three exit/enter cycles leave exactly one view", (await page.$$eval(".marker-view", (v) => v.length)) === 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(root, "artifacts", "marker_portrait_fake_camera.png") });
  check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
} finally {
  await browser.close();
  server.kill();
}
process.exit(ok ? 0 : 1);
