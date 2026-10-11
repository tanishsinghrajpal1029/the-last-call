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
import { simulate, simulateEraser, rad, dialAngle } from "./js/packages/core/src/physics.js";

// Set this to the public HTTPS address of the AR app once it is deployed.
const AR_APP_URL = "https://tanishsinghrajpal.com/the-last-call/";
// The companion Qollab project that runs the same experiment on IonQ as one Python circuit.
const IONQ_PROJECT_URL = "";

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

// ---------- results card: this run's measured numbers, ready for the write-up ----------

/** Fit p(φ) ≈ c + (A/2)·cos(φ − θ) over the 8 dials: A is the fringe contrast, θ the phase. */
function fitFringe(ps, steps) {
  let c = 0, a = 0, b = 0;
  ps.forEach((p, k) => { const ph = dialAngle(k, steps); c += p / steps; a += (2 / steps) * p * Math.cos(ph); b += (2 / steps) * p * Math.sin(ph); });
  return { contrast: 2 * Math.hypot(a, b), phaseDeg: (Math.atan2(b, a) * 180) / Math.PI, mean: c }; // phase in (−180°, 180°]
}

function resultsData(nights, plan, run) {
  const steps = nights.dialSteps;
  const single = run.mode === "single"; // IonQ: one circuit with call 1's settings, listened to and erased at every dial
  const p1 = plan.find((p) => p.nightId === 1), p4 = single ? p1 : plan.find((p) => p.nightId === 4);
  const eNight = single ? 1 : 4;
  const listen = [], trace = [], ideal1 = [];
  for (let k = 0; k < steps; k++) {
    const l = run.bags[`1|${k}|listen`].totals;
    listen.push({ c: l.clear, n: l.clear + l.static });
    if (single) { // the record is made in every eraser block: q0 alone (all shots together) is a traced line
      const e = run.bags[`1|${k}|erase`].totals;
      trace.push({ c: e["plus|clear"] + e["minus|clear"], n: e["plus|clear"] + e["plus|static"] + e["minus|clear"] + e["minus|static"], front: 0 });
    } else {
      const t = run.bags[`1|${k}|trace`].totals;
      const tc = t["front|clear"] + t["side|clear"], tn = tc + t["front|static"] + t["side|static"];
      trace.push({ c: tc, n: tn, front: t["front|clear"] + t["front|static"] });
    }
    ideal1.push(simulate(rad(p1.alphaDeg), rad(p1.thetaDeg), dialAngle(k, steps), false, null).clear);
  }
  const plus = [], minus = [], all = [], idealPlus = [];
  for (let k = 0; k < steps; k++) {
    const e = run.bags[`${eNight}|${k}|erase`].totals;
    const pn = e["plus|clear"] + e["plus|static"], mn = e["minus|clear"] + e["minus|static"];
    plus.push({ c: e["plus|clear"], n: pn });
    minus.push({ c: e["minus|clear"], n: mn });
    all.push({ c: e["plus|clear"] + e["minus|clear"], n: pn + mn });
    const ie = simulateEraser(rad(p4.alphaDeg), rad(p4.thetaDeg), dialAngle(k, steps), null);
    idealPlus.push(ie["plus|clear"] / (ie["plus|clear"] + ie["plus|static"]));
  }
  const rate = (xs) => xs.map((x) => (x.n ? x.c / x.n : 0.5));
  return { steps, single, p1, p4, listen, trace, ideal1, plus, minus, all, idealPlus,
    fitListen: fitFringe(rate(listen), steps), fitTrace: fitFringe(rate(trace), steps),
    fitPlus: fitFringe(rate(plus), steps), fitAll: fitFringe(rate(all), steps), fitIdealPlus: fitFringe(idealPlus, steps) };
}

function drawResults(cv, d, backendName) {
  const g = cv.getContext("2d"), W = cv.width, H = cv.height;
  g.fillStyle = "#0b0f10"; g.fillRect(0, 0, W, H);
  const panel = (x0, title, series, idealCurve) => {
    const L = x0 + 50, R = x0 + W / 2 - 20, T = 60, B = H - 70;
    const X = (k) => L + (k / (d.steps - 1)) * (R - L), Y = (p) => B - p * (B - T);
    g.fillStyle = "#e9efec"; g.font = "600 18px system-ui, sans-serif"; g.fillText(title, x0 + 20, 32);
    g.strokeStyle = "#33403f"; g.lineWidth = 1;
    for (const p of [0, 0.5, 1]) { g.beginPath(); g.moveTo(L, Y(p)); g.lineTo(R, Y(p)); g.stroke(); g.fillStyle = "#8f9a96"; g.font = "13px system-ui"; g.fillText(Math.round(p * 100) + "%", x0 + 8, Y(p) + 4); }
    for (let k = 0; k < d.steps; k++) { g.fillStyle = "#8f9a96"; g.fillText(String(k), X(k) - 4, B + 20); }
    g.fillText("dial setting", (L + R) / 2 - 30, B + 40);
    if (idealCurve) {
      g.strokeStyle = "#cfd8d4"; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath();
      for (let i = 0; i <= 70; i++) { const k = (i / 70) * (d.steps - 1); const p = idealCurve(k); i ? g.lineTo(X(k), Y(p)) : g.moveTo(X(k), Y(p)); }
      g.stroke(); g.setLineDash([]);
    }
    series.forEach(([pts, col], si) => pts.forEach((pt, k) => {
      if (!pt.n) return;
      g.fillStyle = col; g.beginPath(); g.arc(X(k) + (si - (series.length - 1) / 2) * 7, Y(pt.c / pt.n), 6, 0, Math.PI * 2); g.fill();
    }));
    let ly = H - 18, lx = x0 + 20;
    const leg = (col, label, dashed) => {
      if (dashed) { g.strokeStyle = col; g.setLineDash([6, 5]); g.lineWidth = 2; g.beginPath(); g.moveTo(lx, ly - 5); g.lineTo(lx + 22, ly - 5); g.stroke(); g.setLineDash([]); }
      else { g.fillStyle = col; g.beginPath(); g.arc(lx + 8, ly - 5, 6, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = "#cfd8d4"; g.font = "13px system-ui"; g.fillText(label, lx + 28, ly); lx += g.measureText(label).width + 50;
    };
    return leg;
  };
  const steps = d.steps;
  const ideal1 = (k) => simulate(rad(d.p1.alphaDeg), rad(d.p1.thetaDeg), (2 * Math.PI * k) / steps, false, null).clear;
  const idealP = (k) => { const e = simulateEraser(rad(d.p4.alphaDeg), rad(d.p4.thetaDeg), (2 * Math.PI * k) / steps, null); return e["plus|clear"] / (e["plus|clear"] + e["plus|static"]); };
  let leg = panel(0, d.single ? "Listen vs door recorded" : "Call 1: Listen vs Trace", [[d.listen, "#7ad38a"], [d.trace, "#ff8a6b"]], ideal1);
  leg("#7ad38a", "listen (measured)"); leg("#ff8a6b", d.single ? "door recorded (measured)" : "trace (measured)"); leg("#cfd8d4", "ideal listen", true);
  leg = panel(W / 2, d.single ? "The eraser, sorted (same circuit)" : "Call 4: the eraser, sorted", [[d.plus, "#5fd3c4"], [d.minus, "#b48cff"], [d.all, "#9aa6a4"]], idealP);
  leg("#5fd3c4", "+ group"); leg("#b48cff", "− group"); leg("#9aa6a4", "all together"); leg("#cfd8d4", "ideal +", true);
  g.fillStyle = "#8f9a96"; g.font = "12px system-ui"; g.fillText(`Measured on “${backendName}”. y: share of shots with a clear line.`, 20, 52);
}

function resultsMarkdown(d, run, mimic4Deg) {
  const pc = (x) => Math.round(100 * x) + "%";
  const cell = (x) => `${x.c}/${x.n}`;
  const row = (label, xs) => `| ${label} | ${xs.join(" | ")} |`;
  const ks = Array.from({ length: d.steps }, (_, k) => k);
  const traceAll = d.trace.reduce((a, x) => ({ c: a.c + x.c, n: a.n + x.n, front: a.front + x.front }), { c: 0, n: 0, front: 0 });
  const allE = d.all.reduce((a, x) => ({ c: a.c + x.c, n: a.n + x.n }), { c: 0, n: 0 });
  const who4 = d.p4.caller === "sister" ? "Mira" : "the impostor";
  if (d.single) {
    const n0 = d.listen[0].n;
    return [
      `**${run.backendName}** · job ${run.jobId || "(no id)"} · one ${run.qubits}-qubit circuit × ${run.shots} shots (IonQ accepts one circuit per run) · ${run.generatedAt}${run.sampledFromProbabilities ? " · this backend returned probabilities, so shots were sampled from them" : ""}`,
      ``,
      `Call 1's settings (Mira, balanced) in one circuit: a 1-qubit **listen** block at each of the 8 dials, and a 2-qubit **erase** block (record made, then read as + / −) at each dial. Clear shots out of ${n0} per dial:`,
      ``,
      `| | ${ks.map((k) => "dial " + k).join(" | ")} |`,
      `|---|${ks.map(() => "---").join("|")}|`,
      row("Listen, measured", d.listen.map(cell)),
      row("Listen, ideal", d.ideal1.map(pc)),
      row("Door recorded, all shots", d.trace.map(cell)),
      row("+ group (record erased)", d.plus.map(cell)),
      ``,
      `* **Listening shows the fringe:** fitted contrast **${d.fitListen.contrast.toFixed(2)}** (ideal 1.00) at phase ${Math.round(d.fitListen.phaseDeg)}°.`,
      `* **Recording the door flattens it:** fitted contrast **${d.fitTrace.contrast.toFixed(2)}** (ideal 0); ${traceAll.c} of ${traceAll.n} shots clear (${pc(traceAll.c / traceAll.n)}, ideal 50%).`,
      `* **Erasing the record and sorting brings it back:** + group contrast **${d.fitPlus.contrast.toFixed(2)}** (ideal ${d.fitIdealPlus.contrast.toFixed(2)}) at phase ${Math.round(d.fitPlus.phaseDeg)}°.`,
      ``,
      `*Fitted contrast and phase: least-squares fit of the clear rate across the 8 dial settings to ½(1 + V·cos(θ − φ)).*`,
    ].join("\n");
  }
  return [
    `### Results from a real run`,
    ``,
    `**Backend:** ${run.backendName}${run.jobId ? ` · **job:** ${run.jobId}` : ""} · ${run.circuits} circuits × ${run.shots} shots · ${run.generatedAt}${run.sampledFromProbabilities ? " · this backend returned probabilities, so shots were sampled from them" : ""}`,
    ``,
    `**Call 1 (Mira, balanced): listen vs trace.** Clear shots out of ${d.listen[0].n} per dial setting:`,
    ``,
    `| | ${ks.map((k) => "dial " + k).join(" | ")} |`,
    `|---|${ks.map(() => "---").join("|")}|`,
    row("Listen, measured", d.listen.map(cell)),
    row("Listen, ideal", d.ideal1.map(pc)),
    row("Trace, measured", d.trace.map(cell)),
    ``,
    `* Listening shows the interference fringe: fitted contrast **${d.fitListen.contrast.toFixed(2)}** (ideal 1.00), phase ${Math.round(d.fitListen.phaseDeg)}° (Mira's phase is 0°).`,
    `* Tracing the same call erases it: fitted contrast **${d.fitTrace.contrast.toFixed(2)}** (ideal 0), ${traceAll.c} of ${traceAll.n} traced shots clear (${pc(traceAll.c / traceAll.n)}, ideal 50%).`,
    ``,
    `**Call 4 (the caller was ${who4}): the quantum eraser.** All erased shots together: ${allE.c} of ${allE.n} clear (${pc(allE.c / allE.n)}), fitted contrast **${d.fitAll.contrast.toFixed(2)}** (ideal 0, flat). Sorted into the + group, the fringe comes back: contrast **${d.fitPlus.contrast.toFixed(2)}** (ideal ${d.fitIdealPlus.contrast.toFixed(2)}), phase ${Math.round(d.fitPlus.phaseDeg)}° (Mira 0°, impostor ${mimic4Deg}°).`,
    ``,
    `*Fitted contrast and phase: least-squares fit of the clear rate across the 8 dial settings to ½(1 + V·cos(θ − φ)).*`,
  ].join("\n");
}

function showResults(nights, plan, run) {
  try {
    const d = resultsData(nights, plan, run);
    drawResults($("res-chart"), d, run.backendName);
    $("res-md").value = resultsMarkdown(d, run, nights.nights.find((n) => n.id === 4).mimicPhaseDeg);
    $("results-card").hidden = false;
    $("res-copy").onclick = () => {
      const t = $("res-md");
      t.focus(); t.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      $("res-copy").textContent = ok ? "Copied" : "Select all in the box and copy (Cmd+C)";
    };
  } catch (e) {
    console.error("results card", e);
  }
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
  if (run.ok && run.mode === "single") {
    // IonQ accepts one circuit per run: this run measured the call-1 experiment shown in the results card.
    provider = modelProvider(null, rngFromSeed("single:" + seed), nights.dialSteps);
    label = `the ideal model sampled in your browser. This run on “${run.backendName}” measured one ${run.qubits}-qubit circuit (call 1's listen and eraser experiment, shown above); IonQ accepts one circuit per run, too few for a whole night of calls`;
    $("run-status").textContent = `Done in ${run.seconds} s on “${run.backendName}”: one ${run.qubits}-qubit circuit × ${run.shots} shots` + (run.jobId ? `, job ${run.jobId}` : "") +
      (run.sampledFromProbabilities ? " (probabilities returned; shots sampled from them)" : "") + ". IonQ accepts one circuit per run, so the measured results are in the card below; the game plays on the labelled ideal model.";
    showResults(nights, plan, run);
  } else if (run.ok) {
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
    showResults(nights, plan, run);
  } else {
    provider = modelProvider(null, rngFromSeed("fallback:" + seed), nights.dialSteps);
    label = "the ideal model sampled in your browser, because the backend run failed (not a quantum result)";
    const ionqBlocked = run.backendKind === "ionq_noise" && /Failed to fetch|Connection aborted/i.test(String(run.error));
    if (ionqBlocked) {
      // IonQ jobs can't be submitted from this game page (the request never reaches IonQ: no job is created).
      // The same experiment runs as a one-circuit Python project instead.
      $("run-status").innerHTML = `IonQ can't be reached from this game page (${esc(run.error)}). The same experiment runs on IonQ as one 24-qubit circuit in our companion project` +
        (IONQ_PROJECT_URL ? `: <a href="${esc(IONQ_PROJECT_URL)}" target="_blank" rel="noopener">The Last Call — IonQ run</a>` : " “The Last Call — IonQ run”") +
        `. Here, choose the Built-in simulator to play the full game on measured shots; for now you can play on the ideal model (clearly labelled).`;
    } else {
      $("run-status").textContent = "The run did not complete: " + run.error + ". You can still play on the ideal model (clearly labelled), or fix the problem and press Run again.";
    }
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
