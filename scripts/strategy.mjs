// Strategy benchmark: how often each simple policy makes the right call per night.
// Uses the ideal model (or --noisy) sampled in-process; seeds "bench-<i>".
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const J = (p) => import(path.join(root, "build/js/packages/core/src", p));
const N = await J("nights.js"), G = await J("game.js"), E = await J("evidence.js"), V = await J("providers.js"), R = await J("rng.js");
const nights = JSON.parse(readFileSync(path.join(root, "shared/nights.json"), "utf8"));
const noisy = process.argv.includes("--noisy");
const RUNS = Number(process.env.RUNS || 2000);

// policies decide (traces, dial plan) and then choose using the evidence meter
const policies = {
  "guess (no calls)": { traces: () => 0, dial: () => 0, meter: false },
  "trace every call": { traces: (b) => b, dial: () => 0, meter: true },
  "listen at Mira's dial 0 (+2 traces)": { traces: (b, lean) => (lean ? 2 : 0), dial: () => 0, meter: true },
  "listen at the most informative dial (+1 trace)": { traces: (b, lean) => (lean ? 1 : 0), dial: (info) => info.indexOf(Math.max(...info)), meter: true },
  "listen at the most informative dial (+2 traces)": { traces: (b, lean) => (lean ? 2 : 0), dial: (info) => info.indexOf(Math.max(...info)), meter: true },
  "listen at the most informative dial (+3 traces)": { traces: (b, lean) => (lean ? 3 : 0), dial: (info) => info.indexOf(Math.max(...info)), meter: true },
  "adaptive: listen at the best dial until sure, then trace only if it's Mira": { traces: () => 0, dial: (info) => info.indexOf(Math.max(...info)), meter: true, adaptive: true },
  "listen at the most informative dial (+4 traces)": { traces: (b, lean) => (lean ? 4 : 0), dial: (info) => info.indexOf(Math.max(...info)), meter: true },
};

const results = {};
for (const [name, pol] of Object.entries(policies)) {
  const perNight = nights.nights.map(() => ({ good: 0, n: 0, letIn: 0 }));
  for (let i = 0; i < RUNS; i++) {
    const seed = "bench-" + i;
    const plan = N.planRun(nights, seed);
    let s = G.createGame(nights, plan, seed);
    const prov = V.modelProvider(noisy ? nights.noise : null, R.rngFromSeed("o:" + seed));
    const rng = R.rngFromSeed("p:" + seed);
    for (let k = 0; k < nights.nights.length; k++) {
      const cfg = nights.nights[k], p = plan[k];
      const lean = cfg.alphaChoicesDeg.some((a) => a !== 90);
      const info = E.dialInformation(nights, cfg, p.alphaDeg);
      const traces = Math.min(cfg.budget, pol.traces(cfg.budget, lean));
      let id = 0;
      s = G.applyAction(s, { type: "dial", id: `${k}d`, dial: pol.dial(info) }, null).state;
      if (pol.adaptive) {
        // listen until the meter is confident (or until enough calls remain for traces), then trace the rest if it's Mira
        const reserve = lean ? 3 : 0;
        while (s.night.callsLeft > reserve) {
          const post = E.posteriorSister(nights, cfg, p.alphaDeg, s.night.log);
          if (post < 0.03 || post > 0.97) break;
          s = G.applyAction(s, { type: "call", id: `${k}c${id++}`, kind: "listen" }, prov).state;
        }
        const post = E.posteriorSister(nights, cfg, p.alphaDeg, s.night.log);
        while (s.night.callsLeft > 0 && lean && post > 0.5) {
          s = G.applyAction(s, { type: "call", id: `${k}c${id++}`, kind: "trace" }, prov).state;
          const t = E.doorTally(s.night.log);
          if (Math.abs(t.front - t.side) >= 3) break;
        }
        while (s.night.callsLeft > 0 && post <= 0.5 && post >= 0.03) {
          s = G.applyAction(s, { type: "call", id: `${k}c${id++}`, kind: "listen" }, prov).state;
          if (E.posteriorSister(nights, cfg, p.alphaDeg, s.night.log) > 0.5) break;
        }
      } else {
        for (let c = 0; c < cfg.budget; c++) {
          s = G.applyAction(s, { type: "call", id: `${k}c${id++}`, kind: c < traces ? "trace" : "listen" }, prov).state;
        }
      }
      const post = pol.meter ? E.posteriorSister(nights, cfg, p.alphaDeg, s.night.log) : 0.5;
      const t = E.doorTally(s.night.log);
      const door = t.front === t.side ? (rng() < 0.5 ? "front" : "side") : t.front > t.side ? "front" : "side";
      const isSister = post === 0.5 ? rng() < 0.5 : post > 0.5;
      const step = G.applyAction(s, { type: "decide", id: `${k}x`, choice: isSister ? door : "hangup" }, null);
      perNight[k].n++;
      if (step.result === "saved" || step.result === "refused") perNight[k].good++;
      if (step.result === "letIn") perNight[k].letIn++;
      s = G.applyAction(step.state, { type: "next", id: `${k}n` }, null).state;
    }
  }
  results[name] = perNight.map((x) => ({ correct: x.good / x.n, letIn: x.letIn / x.n }));
}
const lines = [`# Strategy benchmark (${noisy ? "illustrative noise" : "ideal"} model, ${RUNS} runs, seeds bench-0..)`, "",
  "Correct decision rate per night (saved Mira through the right door, or hung up on the mimic). ± is the 95% normal interval.", "",
  "| Policy | " + nights.nights.map((n) => `Night ${n.id}`).join(" | ") + " |", "|---|" + nights.nights.map(() => "---|").join("")];
for (const [name, rows] of Object.entries(results)) {
  lines.push(`| ${name} | ` + rows.map((r) => `${(100 * r.correct).toFixed(1)}% ±${(196 * Math.sqrt(r.correct * (1 - r.correct) / RUNS)).toFixed(1)}`).join(" | ") + " |");
}
console.log(lines.join("\n"));
if (process.env.OUT) { mkdirSync(path.dirname(process.env.OUT), { recursive: true }); writeFileSync(process.env.OUT, lines.join("\n") + "\n"); }
