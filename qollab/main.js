// The Last Call — Qollab entry point.
// Runs every circuit the game can need on the backend chosen in "Select QPU"
// (one batched job), then plays the game on those measured shots: one shot per
// in-game call, each used at most once. Python is called with .callPromising
// (required on IonQ backends); results come back as JSON strings.
import { load_nights, run_calls, circuit_text } from "qollab_api";
import { startRun, defaultSettings } from "./js/apps/web/src/app.js";
import { planRun, validateNights } from "./js/packages/core/src/nights.js";
import { shotBagProvider, expandCounts, modelProvider } from "./js/packages/core/src/providers.js";
import { rngFromSeed } from "./js/packages/core/src/rng.js";
import { simulate, rad, dialAngle } from "./js/packages/core/src/physics.js";

// Set this to the public HTTPS address of the AR app once it is deployed.
const AR_APP_URL = "";

const $ = (id) => document.getElementById(id);
const pct = (x) => (100 * x).toFixed(0) + "%";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function randomSeed() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 100000).padStart(5, "0");
}

function showArLink() {
  $("ar-link").innerHTML = AR_APP_URL
    ? `Play the same game in AR on your phone: <a href="${esc(AR_APP_URL)}" target="_blank" rel="noopener">${esc(AR_APP_URL)}</a> (that version samples the exact model; this page uses this run's measured shots).`
    : "The AR version runs on your phone as a separate HTTPS page (AR_APP_URL in main.js is not set yet).";
}

function rawTable(nights, plan, run) {
  // spoiler table: measured clear rate per dial vs ideal, per call
  return plan.map((p, i) => {
    const cfg = nights.nights[i];
    const cells = [];
    const erase = !cfg.tools.includes("listen");
    for (let k = 0; k < nights.dialSteps; k++) {
      const ideal = simulate(rad(p.alphaDeg), rad(p.thetaDeg), dialAngle(k, nights.dialSteps), false, null).clear;
      if (!erase) {
        const t = run.bags[`${p.nightId}|${k}|listen`].totals;
        const n = t.clear + t.static;
        cells.push(`<td>${pct(t.clear / n)} <span class="fine">(${t.clear}/${n}; ideal ${pct(ideal)})</span></td>`);
      } else { // eraser night: the + group's clear rate follows the same voiceprint
        const t = run.bags[`${p.nightId}|${k}|erase`].totals;
        const n = t["plus|clear"] + t["plus|static"], all = n + t["minus|clear"] + t["minus|static"];
        cells.push(`<td>${pct(t["plus|clear"] / n)} <span class="fine">(+ group ${t["plus|clear"]}/${n}; ideal ${pct(ideal)}; all ${(t["plus|clear"] + t["minus|clear"])}/${all})</span></td>`);
      }
    }
    let tc = 0, tn = 0, tf = 0;
    if (cfg.tools.includes("trace")) for (let k = 0; k < nights.dialSteps; k++) {
      const t = run.bags[`${p.nightId}|${k}|trace`].totals;
      tc += t["front|clear"] + t["side|clear"];
      tf += t["front|clear"] + t["front|static"];
      tn += t["front|clear"] + t["front|static"] + t["side|clear"] + t["side|static"];
    }
    return `<tr><th scope="row">${cfg.id}. ${esc(cfg.title)}<br><span class="fine">${p.caller === "sister" ? "Mira" : "mimic"}, θ = ${p.thetaDeg}°, α = ${p.alphaDeg}°${erase ? "; eraser" : ""}</span></th>${cells.join("")}
      <td>${tn ? `${pct(tc / tn)} clear · ${pct(tf / tn)} front <span class="fine">(n=${tn}; ideal 50% · ${pct(Math.cos(rad(p.alphaDeg) / 2) ** 2)})</span>` : "—"}</td></tr>`;
  }).join("");
}

async function main() {
  showArLink();
  const nights = JSON.parse(String(await load_nights.callPromising()));
  const errs = validateNights(nights);
  if (errs.length) throw new Error("nights.json failed validation: " + errs.join("; "));
  try {
    $("circuit").textContent = "Listen:\n" + String(await circuit_text.callPromising(false)) + "\n\nTrace:\n" + String(await circuit_text.callPromising(true));
  } catch (e) {
    $("circuit").textContent = "Circuit drawing unavailable: " + e;
  }
  const seed = randomSeed();
  const plan = planRun(nights, seed);
  const nCircuits = nights.nights.reduce((a, n) => a + n.tools.length * nights.dialSteps, 0);
  $("run-status").textContent = `Submitting one batched job (${nCircuits} circuits) to the selected backend…`;
  const run = JSON.parse(String(await run_calls.callPromising(backend, JSON.stringify(plan), seed)));
  const settings = defaultSettings();
  let provider, label;
  if (run.ok) {
    const bags = {};
    for (const [k, v] of Object.entries(run.bags)) {
      const t = v.totals;
      bags[k] = expandCounts(k.endsWith("listen") ? { clear: t.clear, static: t.static } : t);
    }
    provider = shotBagProvider({ backendName: run.backendName, bags, sampledFromProbabilities: run.sampledFromProbabilities }, rngFromSeed("shots:" + seed));
    label = `fresh shots from “${run.backendName}” in this Qollab run` + (run.jobId ? ` (job ${run.jobId})` : "") +
      (run.sampledFromProbabilities ? "; this backend returned probabilities, so shots were sampled from them in Python" : "");
    $("run-status").textContent = `Done in ${run.seconds} s on “${run.backendName}”: ${run.circuits} circuits × ${run.shots} shots` +
      (run.jobId ? `, job ${run.jobId}` : "") + (run.sampledFromProbabilities ? " (probabilities returned; shots sampled from them)" : "") + ". The game below plays on these measured shots.";
    $("raw").innerHTML = `<table class="score-table raw-table"><caption class="fine">Clear-line rate per dial for each call in this run${run.sampledFromProbabilities ? " (shots sampled from the backend's probabilities)" : ""}, with the ideal model for comparison.</caption><thead><tr><th scope="col">Call</th>${Array.from({ length: nights.dialSteps }, (_, k) => `<th scope="col">WHO call, dial ${k}</th>`).join("")}<th scope="col">Trace (all dials)</th></tr></thead><tbody>${rawTable(nights, plan, run)}</tbody></table>`;
    $("raw-details").hidden = false;
  } else {
    provider = modelProvider(null, rngFromSeed("fallback:" + seed), nights.dialSteps);
    label = "the ideal model sampled in your browser, because the backend run failed (not a quantum result)";
    $("run-status").textContent = "The run did not complete: " + run.error + ". You can still play on the ideal model (clearly labelled), or fix the problem and press Run again.";
  }
  const start = () => {
    const r = startRun($("game"), nights, seed, provider, label, settings, "screen");
    r.ui.onExit = () => { r.dispose(); $("game").innerHTML = `<p>Run ended. Press Run again for a fresh job and a new night.</p>`; };
    r.ui.onRestart = () => { r.dispose(); $("game").innerHTML = `<p>Each Run measures fresh shots for one night of calls. Press Run again to play another.</p>`; };
  };
  start();
}

main().catch((e) => {
  $("run-status").textContent = "Error: " + (e && e.message ? e.message : e);
  console.error(e);
});
