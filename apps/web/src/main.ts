/** The Last Call — web entry point: load the nights, pick a mode, run. */

import { NightsFile, validateNights } from "../../../packages/core/src/nights.js";
import { modelProvider } from "../../../packages/core/src/providers.js";
import { rngFromSeed } from "../../../packages/core/src/rng.js";
import { defaultSettings, Running, startRun } from "./app.js";
import { Audio } from "./audio.js";
import { Controller, Settings } from "./controller.js";
import { MarkerView } from "./ar/marker.js";
import { XrView, xrSupported } from "./ar/xr.js";
import { GyroView, gyroCapable, requestMotionPermission } from "./ar/gyro.js";
import { Ui } from "./ui.js";
import { BonusView } from "./bonus.js";
import { BonusConfig, modelBonusProvider } from "../../../packages/core/src/bonus.js";

type Mode = "screen" | "xr" | "marker" | "gyro";
type Source = "ideal" | "noisy";

const app = document.getElementById("app")!;
const params = new URLSearchParams(location.search);
const settings: Settings = defaultSettings();
let running: { dispose: () => void } | null = null;
let nights: NightsFile;
let caps = { xr: false, camera: false, gyro: false };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function randomSeed(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0]! % 100000).toString().padStart(5, "0");
}

function provider(source: Source, seed: string) {
  return modelProvider(source === "noisy" ? nights.noise : null, rngFromSeed("calls:" + seed + ":" + Date.now()), nights.dialSteps);
}

const SOURCE_LABEL: Record<Source, string> = {
  ideal: "the ideal model (exact probabilities, sampled in your browser; not a quantum computer)",
  noisy: "an illustrative noise model (our own depolarizing channel, sampled in your browser; not IonQ and not a quantum computer)",
};

async function main(): Promise<void> {
  try {
    const res = await fetch("./data/nights.json");
    if (!res.ok) throw new Error("Could not load the nights (" + res.status + ")");
    nights = (await res.json()) as NightsFile;
    const errs = validateNights(nights);
    if (errs.length) throw new Error("Night data failed validation: " + errs.join("; "));
  } catch (e) {
    app.innerHTML = `<main class="start"><h1>The Last Call</h1><p role="alert">${(e as Error).message}</p></main>`;
    return;
  }
  caps = { xr: await xrSupported(), camera: window.isSecureContext && !!navigator.mediaDevices?.getUserMedia, gyro: gyroCapable() };
  if (params.get("autostart") === "screen") {
    launch("screen", (params.get("source") as Source) || "ideal", params.get("seed") || randomSeed());
    return;
  }
  showStart();
}

function showStart(message = ""): void {
  running?.dispose();
  running = null;
  const seed = (params.get("seed") || randomSeed()).replace(/[^0-9A-Za-z_-]/g, "").slice(0, 12) || randomSeed();
  app.innerHTML = `
  <main class="start">
    <p class="kicker">A quantum horror game · Qollab × IonQ Global Quantum Hackathon</p>
    <h1>The Last Call</h1>
    <p class="pitch">Your sister calls and asks you to let her in. The intercom shows her at <em>both</em> doors at once: one call, two entrances. Listen to both doors together and the pattern tells you <strong>who</strong> is calling. Trace the call and you learn <strong>where</strong> she is, but tracing destroys the very interference that told you who she was.</p>
    ${message ? `<p class="notice" role="alert">${esc(message)}</p>` : ""}
    <p class="content-note"><strong>Content note:</strong> mild horror, a creepy voice and sudden sounds (turn on Gentle mode below). No gore.</p>
    <form class="start-form" id="start-form">
      <div class="modes">
        <button type="submit" class="btn btn-primary btn-big" data-mode="xr" ${caps.xr ? "" : "disabled"}>Play in AR on your table <span class="sub">${caps.xr ? "Android Chrome (WebXR)" : "needs Chrome on an ARCore Android phone, over HTTPS"}</span></button>
        <button type="submit" class="btn btn-primary btn-big" data-mode="gyro" ${caps.gyro ? "" : "disabled"}>Play in AR, no marker (iPhone) <span class="sub">${caps.gyro ? "camera + motion sensors: turn to look around; the house stays put" : "needs a phone camera, motion sensors and an HTTPS page"}</span></button>
        <button type="submit" class="btn btn-secondary btn-big" data-mode="marker" ${caps.camera ? "" : "disabled"}>Play in AR on a printed marker <span class="sub">${caps.camera ? "full table tracking on iPhone: walk around the house" : "needs a camera and an HTTPS page"}</span></button>
        <button type="submit" class="btn btn-secondary btn-big" data-mode="screen">Play on this screen <span class="sub">desktop or phone, keyboard friendly</span></button>
      </div>
      <p><a href="./marker.html" target="_blank" rel="noopener">Open the printable marker</a> (print at 100%, 120 mm square).</p>
      <fieldset><legend>Where the call outcomes come from</legend>
        <label><input type="radio" name="source" value="ideal" checked> Ideal model (exact quantum probabilities, sampled here)</label>
        <label><input type="radio" name="source" value="noisy"> Illustrative noise (our channel, not IonQ)</label>
        <p class="fine">Fresh outcomes measured on a real backend (simulators or IonQ) are played on the Qollab page of this project.</p>
      </fieldset>
      <fieldset><legend>Options</legend>
        <label><input type="checkbox" id="opt-voice" ${settings.voice ? "checked" : ""}> Spoken voice</label>
        <label><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""}> Sound</label>
        <label><input type="checkbox" id="opt-gentle" ${settings.gentle ? "checked" : ""}> Gentle mode (no loud stingers)</label>
        <label><input type="checkbox" id="opt-meter" ${settings.meter ? "checked" : ""}> Evidence meter</label>
        <label class="seed">Run seed <input id="seed" value="${esc(seed)}" inputmode="numeric" maxlength="12" aria-describedby="seed-help"></label>
        <p class="fine" id="seed-help">The seed fixes who calls each night and how each call leans. Call outcomes are always fresh.</p>
      </fieldset>
    </form>
    <p class="fine attribution">This effort is supported by Qollab &amp; IonQ · MIT licence · <a href="https://github.com/" id="repo-link" hidden>source</a></p>
  </main>`;
  const form = document.getElementById("start-form") as HTMLFormElement;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const btn = (e as SubmitEvent).submitter as HTMLButtonElement | null;
    const mode = (btn?.dataset.mode as Mode) || "screen";
    // iOS only allows the motion-sensor prompt directly inside the tap
    const motion = mode === "gyro" ? requestMotionPermission() : Promise.resolve(true);
    const source = ((form.querySelector('input[name="source"]:checked') as HTMLInputElement)?.value as Source) || "ideal";
    const get = (id: string) => (document.getElementById(id) as HTMLInputElement).checked;
    settings.voice = get("opt-voice");
    settings.sound = get("opt-sound");
    settings.gentle = get("opt-gentle");
    settings.meter = get("opt-meter");
    const s = (document.getElementById("seed") as HTMLInputElement).value.trim() || randomSeed();
    void motion.then((ok) => {
      if (mode === "gyro" && !ok) { showStart("Motion & Orientation access was not allowed, so look-around AR can't follow the phone. Allow it in the prompt, or use the printed marker."); return; }
      launch(mode, source, s);
    });
  });
}

/** Bonus scene: the quantum eraser (screen mode, after the ending). */
function startBonus(source: Source, seed: string): void {
  running?.dispose();
  running = null;
  app.innerHTML = "";
  const cfg = (nights as unknown as { bonus: BonusConfig }).bonus;
  const noise = source === "noisy" ? nights.noise : null;
  const audio = new Audio();
  audio.voice = settings.voice;
  audio.sound = settings.sound;
  audio.gentle = settings.gentle;
  audio.unlock();
  const view = new BonusView(app, cfg, seed + ":bonus", (state) => modelBonusProvider(cfg, state, noise, rngFromSeed("bonus-calls:" + seed + ":" + Date.now())),
    SOURCE_LABEL[source], noise, audio, settings.gentle, settings.reducedMotion);
  view.onExit = () => showStart();
  running = { dispose: () => { view.dispose(); audio.dispose(); } };
  (window as any).__lastCall = { bonus: view };
}

function launch(mode: Mode, source: Source, seed: string): void {
  running?.dispose();
  running = null;
  app.innerHTML = "";
  if (mode === "screen") {
    const r: Running = startRun(app, nights, seed, provider(source, seed), SOURCE_LABEL[source], settings, "screen");
    r.audio.unlock();
    r.ui.onExit = () => showStart();
    r.ui.onRestart = () => launch(mode, source, randomSeed());
    r.ui.onBonus = () => startBonus(source, seed);
    running = r;
    (window as any).__lastCall = r; // test hook
    return;
  }
  // AR modes: the UI lives inside the AR overlay
  const audio = new Audio();
  audio.voice = settings.voice;
  audio.sound = settings.sound;
  audio.gentle = settings.gentle;
  audio.unlock();
  const controller = new Controller(nights, seed, provider(source, seed), SOURCE_LABEL[source], settings);
  const mountUi = (parent: HTMLElement) => {
    const ui = new Ui(parent, controller, mode, audio);
    // AR sessions need a fresh user gesture to start, so "Play again" returns to the start screen
    ui.onRestart = () => void view.stop();
    return ui;
  };
  const exit = () => {
    audio.dispose();
    running = null;
    showStart();
  };
  // eslint-disable-next-line prefer-const
  let view: XrView | MarkerView | GyroView;
  view = mode === "xr" ? new XrView(controller, mountUi, exit) : mode === "gyro" ? new GyroView(controller, mountUi, exit) : new MarkerView(controller, mountUi, exit);
  running = { dispose: () => { void view.stop(); audio.dispose(); } };
  (window as any).__lastCall = { controller, view };
  view.start(app).catch((e: Error) => {
    audio.dispose();
    running = null;
    showStart(e.message || String(e));
  });
}

void main();
