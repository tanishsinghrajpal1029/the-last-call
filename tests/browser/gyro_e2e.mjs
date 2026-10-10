// Look-around (no-marker) AR in desktop Chromium: fake camera + synthetic
// deviceorientation events. Evidence the pipeline runs; NOT evidence for a phone.
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const y4m = path.join(root, "build", "fake_camera.y4m");
execFileSync(process.execPath, [path.join(root, "tests/browser/make_fake_camera.mjs"), y4m], { stdio: "ignore" });
const port = 8000 + Math.floor(Math.random() * 900);
const server = spawn(process.execPath, [path.join(root, "scripts/serve.mjs")], { env: { ...process.env, PORT: String(port) }, stdio: "pipe" });
await new Promise((r) => setTimeout(r, 600));
let ok = true;
const check = (n, c, d = "") => { console.log((c ? "PASS " : "FAIL ") + n + (d ? " — " + d : "")); ok &&= !!c; };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`, "--use-gl=angle", "--use-angle=swiftshader"],
});
const orient = (page, alpha, beta, gamma) => page.evaluate(([a, b, g]) => window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { alpha: a, beta: b, gamma: g })), [alpha, beta, gamma]);
const centreDrawn = (page) => page.evaluate(() => {
  const c = document.querySelector(".gyro-view canvas");
  const tmp = document.createElement("canvas"); tmp.width = c.width; tmp.height = c.height;
  const g = tmp.getContext("2d"); g.drawImage(c, 0, 0);
  const d = g.getImageData(Math.floor(c.width * 0.3), Math.floor(c.height * 0.3), Math.floor(c.width * 0.4), Math.floor(c.height * 0.4)).data;
  let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 40) n++; return n;
});
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["camera"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/?seed=7&glread=1`);
  await page.waitForSelector("#start-form");
  check("no-marker AR button enabled (camera + orientation available)", !(await page.$eval('button[data-mode="gyro"]', (b) => b.disabled)));
  await page.click('button[data-mode="gyro"]');
  await page.waitForSelector(".gyro-view canvas");
  await page.waitForSelector(".sheet-intro");
  await page.click("#answer");
  check("waits for motion sensors before placing", /motion sensors/i.test(await page.textContent(".gyro-view .xr-status")));
  // phone upright, facing north
  for (let i = 0; i < 5; i++) { await orient(page, 0, 90, 0); await page.waitForTimeout(50); }
  await page.waitForTimeout(300);
  check("house placed ahead once orientation arrives", await page.evaluate(() => window.__lastCall.view.placed === true));
  const ahead = await centreDrawn(page);
  check("house drawn in the middle of the view", ahead > 200, String(ahead));
  await page.screenshot({ path: path.join(root, "artifacts", "gyro_fake_camera.png") });
  // turn 120° away: the house stays where it was, so it leaves the middle of the view
  for (let i = 0; i < 5; i++) { await orient(page, 120, 90, 0); await page.waitForTimeout(50); }
  await page.waitForTimeout(300);
  const away = await centreDrawn(page);
  check("turning away moves the house out of view (it stays put in the room)", away < ahead * 0.2, `${away} vs ${ahead}`);
  for (let i = 0; i < 5; i++) { await orient(page, 0, 90, 0); await page.waitForTimeout(50); }
  await page.waitForTimeout(300);
  check("turning back brings it back", (await centreDrawn(page)) > ahead * 0.6);
  await page.click("#stage-next"); await page.click("#stage-next");
  await page.click("#listen-btn");
  await page.waitForTimeout(200);
  check("listen works from the look-around overlay", (await page.$$("#log li")).length === 1);
  await page.click("#exit-btn");
  await page.waitForSelector("#start-form");
  check("exit returns to start and removes the view", (await page.$$(".gyro-view")).length === 0);
  check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
} finally {
  await browser.close();
  server.kill();
}
process.exit(ok ? 0 : 1);
