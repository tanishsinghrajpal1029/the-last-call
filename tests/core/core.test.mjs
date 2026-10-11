// Rules, physics cross-check against the Python reference table, providers and evidence.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const J = (p) => import(path.join(root, "build/js/packages/core/src", p));
const P = await J("physics.js");
const N = await J("nights.js");
const G = await J("game.js");
const E = await J("evidence.js");
const V = await J("providers.js");
const R = await J("rng.js");
const nights = JSON.parse(readFileSync(path.join(root, "shared/nights.json"), "utf8"));
const table = JSON.parse(readFileSync(path.join(root, "data/reference/model_table.json"), "utf8"));
const rad = (d) => (d * Math.PI) / 180;

test("TS simulator matches the Python reference table (ideal and noisy) to 1e-12", () => {
  assert.equal(table.nightsVersion, nights.version);
  for (const r of table.rows) {
    const args = [rad(r.alphaDeg), rad(r.thetaDeg), P.dialAngle(r.dial)];
    const erase = r.kind === "erase";
    const ideal = erase ? P.simulateEraser(...args, null) : P.simulate(...args, r.trace, null);
    const noisy = erase ? P.simulateEraser(...args, nights.noise) : P.simulate(...args, r.trace, nights.noise);
    const formula = erase ? null : P.idealProbabilities(...args, r.trace);
    for (const k of Object.keys(r.ideal)) {
      assert.ok(Math.abs(ideal[k] - r.ideal[k]) < 1e-12, `ideal ${k}`);
      if (formula) assert.ok(Math.abs(formula[k] - r.ideal[k]) < 1e-12, `formula ${k}`);
      assert.ok(Math.abs(noisy[k] - r.noisy[k]) < 1e-12, `noisy ${k}`);
    }
  }
});

test("nights file is valid and run plans are deterministic and fixed", () => {
  assert.deepEqual(N.validateNights(nights), []);
  const a = N.planRun(nights, "s1"), b = N.planRun(nights, "s1");
  assert.deepEqual(a, b);
  assert.equal(a[0].caller, "sister");
  const callers = new Set();
  for (let i = 0; i < 200; i++) for (const p of N.planRun(nights, "x" + i).slice(1)) callers.add(p.caller);
  assert.deepEqual([...callers].sort(), ["mimic", "sister"]);
  const bad = JSON.parse(JSON.stringify(nights));
  bad.nights[2].alphaChoicesDeg = [60, 150];
  assert.ok(N.validateNights(bad).some((e) => /share/.test(e)), "asymmetric lean choices would leak through the meter");
  assert.equal(N.correctDoor({ alphaDeg: 90 }), "either");
  assert.equal(N.correctDoor({ alphaDeg: 60 }), "front");
  assert.equal(N.correctDoor({ alphaDeg: 120 }), "side");
});

function game(planOverride) {
  const plan = N.planRun(nights, "t");
  if (planOverride) Object.assign(plan[planOverride.i], planOverride.p);
  return G.createGame(nights, plan, "t");
}
const fixed = (line, door) => () => ({ line, door, source: "test" });

test("each call debits one call and consumes exactly one outcome; duplicates ignored", () => {
  let s = game();
  let n = 0;
  const prov = () => { n++; return { line: "clear", source: "test" }; };
  let st = G.applyAction(s, { type: "call", id: "a", kind: "listen" }, prov);
  assert.equal(st.state.night.callsLeft, nights.nights[0].budget - 1);
  assert.equal(n, 1);
  const again = G.applyAction(st.state, { type: "call", id: "a", kind: "listen" }, prov);
  assert.equal(again.state, st.state);
  assert.equal(n, 1);
});

test("provider errors leave the state unchanged; budget is enforced", () => {
  let s = game();
  const r = G.applyAction(s, { type: "call", id: "x", kind: "listen" }, () => { throw new Error("down"); });
  assert.ok(r.error);
  assert.equal(r.state, s);
  for (let i = 0; i < nights.nights[0].budget; i++) s = G.applyAction(s, { type: "call", id: "c" + i, kind: "listen" }, fixed("clear")).state;
  const over = G.applyAction(s, { type: "call", id: "z", kind: "listen" }, fixed("clear"));
  assert.match(over.error, /No calls left/);
  assert.equal(over.state.night.callsLeft, 0);
});

test("trace outcomes must carry a door; invalid outcomes throw", () => {
  const s = game();
  assert.throws(() => G.applyAction(s, { type: "call", id: "t", kind: "trace" }, fixed("clear")));
  assert.throws(() => G.applyAction(s, { type: "call", id: "u", kind: "listen" }, fixed("maybe")));
  const ok = G.applyAction(s, { type: "call", id: "v", kind: "trace" }, fixed("static", "side"));
  assert.equal(ok.record.door, "side");
});

test("dial changes are free and validated", () => {
  const s = game();
  const d = G.applyAction(s, { type: "dial", id: "d", dial: 3 }, null);
  assert.equal(d.state.night.dial, 3);
  assert.equal(d.state.night.callsLeft, s.night.callsLeft);
  assert.ok(G.applyAction(s, { type: "dial", id: "e", dial: 8 }, null).error);
});

test("decisions: every caller/choice combination scores as specified", () => {
  const cases = [
    [{ caller: "sister", alphaDeg: 90 }, "front", "saved"],
    [{ caller: "sister", alphaDeg: 90 }, "side", "saved"],
    [{ caller: "sister", alphaDeg: 60 }, "side", "wrongDoor"],
    [{ caller: "sister", alphaDeg: 120 }, "side", "saved"],
    [{ caller: "sister", alphaDeg: 60 }, "hangup", "abandoned"],
    [{ caller: "mimic", alphaDeg: 60 }, "hangup", "refused"],
    [{ caller: "mimic", alphaDeg: 60 }, "front", "letIn"],
  ];
  for (const [p, choice, expect] of cases) {
    const s = game({ i: 0, p });
    const r = G.applyAction(s, { type: "decide", id: "d", choice }, null);
    assert.equal(r.result, expect);
    const left = nights.nights[0].budget;
    const pts = expect === "saved" || expect === "refused" ? 100 + 5 * left : expect === "wrongDoor" ? 20 : expect === "letIn" ? -100 : 0;
    assert.equal(r.state.score, pts);
    assert.ok(G.applyAction(r.state, { type: "decide", id: "d2", choice }, null).error);
    assert.ok(G.applyAction(r.state, { type: "call", id: "c", kind: "listen" }, fixed("clear")).error);
  }
});

test("the plan is hidden until the decision and never changes", () => {
  let s = game();
  const before = JSON.stringify(s.plan);
  assert.equal(G.publicView(s).revealed, null);
  for (let i = 0; i < 4; i++) s = G.applyAction(s, { type: "call", id: "c" + i, kind: i % 2 ? "trace" : "listen" }, fixed("static", "front")).state;
  assert.equal(JSON.stringify(s.plan), before);
  s = G.applyAction(s, { type: "decide", id: "d", choice: "hangup" }, null).state;
  assert.ok(G.publicView(s).revealed);
});

test("a full run advances through every night and ends", () => {
  let s = game();
  for (let i = 0; i < nights.nights.length; i++) {
    s = G.applyAction(s, { type: "decide", id: "d" + i, choice: "hangup" }, null).state;
    s = G.applyAction(s, { type: "next", id: "n" + i }, null).state;
  }
  assert.equal(s.over, true);
  assert.equal(s.history.length, nights.nights.length);
  assert.ok(G.applyAction(s, { type: "dial", id: "q", dial: 1 }, null).error);
});

test("model provider frequencies match the model (ideal fringe, trace = 50/50)", () => {
  const prov = V.modelProvider(null, R.rngFromSeed("f"));
  const req = { nightId: 3, alphaDeg: 60, thetaDeg: 0, dial: 1, trace: false };
  let clear = 0, n = 20000;
  for (let i = 0; i < n; i++) if (prov(req).line === "clear") clear++;
  const p = (1 + Math.sin(rad(60)) * Math.cos(rad(-45))) / 2;
  assert.ok(Math.abs(clear / n - p) < 4 * Math.sqrt(p * (1 - p) / n));
  let front = 0, tc = 0;
  for (let i = 0; i < n; i++) {
    const o = prov({ ...req, trace: true, dial: i % 8 });
    if (o.door === "front") front++;
    if (o.line === "clear") tc++;
  }
  assert.ok(Math.abs(front / n - 0.75) < 0.015);
  assert.ok(Math.abs(tc / n - 0.5) < 0.015);
});

test("shot-bag provider uses each measured shot at most once", () => {
  const bags = { [V.bagKey(1, 0, "listen")]: V.expandCounts({ clear: 2, static: 1 }), [V.bagKey(1, 0, "trace")]: ["side|static"], [V.bagKey(1, 0, "erase")]: ["minus|clear"] };
  const prov = V.shotBagProvider({ backendName: "test backend", bags }, R.rngFromSeed("b"));
  const req = { nightId: 1, alphaDeg: 90, thetaDeg: 0, dial: 0, trace: false, eraser: false };
  const got = [prov(req), prov(req), prov(req)].map((o) => o.line).sort();
  assert.deepEqual(got, ["clear", "clear", "static"]);
  assert.throws(() => prov(req), /no measured shots/);
  assert.deepEqual(prov({ ...req, trace: true }), { line: "static", door: "side", source: "measured shot from test backend" });
  assert.deepEqual(prov({ ...req, trace: true, eraser: true }), { line: "clear", sign: "minus", source: "measured shot from test backend" });
  assert.throws(() => V.expandCounts({ clear: 1.5 }));
  const sampled = V.shotBagProvider({ backendName: "ionq", sampledFromProbabilities: true, bags: { [V.bagKey(1, 0, "listen")]: ["clear"] } }, R.rngFromSeed("c"));
  assert.match(sampled(req).source, /sampled from ionq's returned probabilities/);
});

test("evidence: listening moves the meter, tracing never does", () => {
  const cfg = nights.nights[1]; // call 2: the impostor is 90° out of step
  const rec = (kind, dial, line, door) => ({ n: 1, kind, dial, line, door, text: "", source: "t" });
  assert.equal(E.posteriorSister(nights, cfg, 90, []), 0.5);
  assert.ok(E.posteriorSister(nights, cfg, 90, [rec("listen", 0, "static")]) < 0.05); // Mira is never static at 0
  assert.ok(E.posteriorSister(nights, cfg, 90, [rec("listen", 6, "clear")]) > 0.95); // the impostor is never clear at 6
  const weak = E.posteriorSister(nights, cfg, 90, [rec("listen", 0, "clear")]);
  assert.ok(weak > 0.6 && weak < 0.75, "clear at Mira's own dial is weak evidence now: " + weak);
  const t = E.posteriorSister(nights, cfg, 90, [rec("trace", 0, "clear", "front"), rec("trace", 3, "static", "side")]);
  assert.ok(Math.abs(t - 0.5) < 1e-12);
  // same meter whichever door the call leans to
  const c4 = nights.nights[3];
  const log = [rec("listen", 7, "clear"), rec("listen", 6, "static")];
  assert.ok(Math.abs(E.posteriorSister(nights, c4, 60, log) - E.posteriorSister(nights, c4, 120, log)) < 1e-12);
});

test("dial information: the best dials are not Mira's own setting (listen on call 2, erase on call 4)", () => {
  const info2 = E.dialInformation(nights, nights.nights[1], 90);
  assert.ok(info2[0] < Math.max(...info2), "dial 0 is not the best test on call 2");
  assert.ok([3, 7].includes(info2.indexOf(Math.max(...info2))));
  assert.ok(info2[1] < 1e-9 && info2[5] < 1e-9, "dials 1 and 5 tell nothing: both callers give the same rate there");
  const info = E.dialInformation(nights, nights.nights[3], 60);
  const best = Math.max(...info);
  assert.ok(info[0] < best, "dial 0 is not the best test on call 4");
  assert.ok([3, 7].includes(info.indexOf(best)), String(info.indexOf(best)));
  const tally = E.doorTally([{ kind: "trace", door: "front" }, { kind: "trace", door: "side" }, { kind: "trace", door: "front" }, { kind: "listen" }]);
  assert.deepEqual(tally, { front: 2, side: 1 });
});

test("every spoken game line has a recorded clip with the same text", async () => {
  const L = await J("lines.js");
  const voices = JSON.parse(readFileSync(path.join(root, "shared/voice_lines.json"), "utf8"));
  const byId = Object.fromEntries(voices.lines.map((l) => [l.id, l.text]));
  L.CLEAR_LINES.forEach((t, i) => assert.equal(byId["clear_" + i], t));
  L.STATIC_LINES.forEach((t, i) => assert.equal(byId["static_" + i], t));
  for (const [k, t] of Object.entries(L.INTRO)) assert.equal(byId["intro_" + k], t);
  const manifest = JSON.parse(readFileSync(path.join(root, "data/voices/manifest.json"), "utf8"));
  assert.equal(manifest.version, voices.version);
  for (const l of voices.lines) assert.ok(manifest.files[l.id] && manifest.files[l.id].text === l.text, "clip for " + l.id + " is current");
});

test("walkthrough reactions and door lines have clips with the same text; status never overclaims", async () => {
  const G = await import(path.join(root, "build/js/apps/web/src/guide.js"));
  const voices = JSON.parse(readFileSync(path.join(root, "shared/voice_lines.json"), "utf8"));
  const byId = Object.fromEntries(voices.lines.map((l) => [l.id, l.text]));
  for (const [k, t] of Object.entries({ ...G.TUT_REACT, ...G.HESITATE })) assert.equal(byId[k], t, k);
  assert.ok(byId.stage_goal.startsWith(G.GOAL));
  // reactions follow the result actually received
  assert.equal(G.reactionFor("listen", { kind: "listen", dial: 0, line: "static" }), "tut_listen_static");
  assert.equal(G.reactionFor("interference", { kind: "listen", dial: 4, line: "static" }), "tut_dial4_static");
  assert.equal(G.reactionFor("trace", { kind: "trace", dial: 0, line: "clear", door: "front" }), "tut_trace");
  assert.equal(G.reactionFor("listen", { kind: "listen", dial: 3, line: "clear" }), null);
  // status language: a probability is never stated as certainty; one-trace margins stay uncertain
  assert.equal(G.caseStatus(0.85, 3, 1, 0, true, 3, [2, 6]).who, "Mira likely");
  assert.equal(G.caseStatus(0.85, 3, 1, 0, true, 3, [2, 6]).where, "leans front, but still uncertain");
  assert.equal(G.caseStatus(0.5, 2, 2, 2, true, 1, [2, 6]).where, "door uncertain (traces tied)");
  assert.equal(G.caseStatus(null, 2, 0, 0, false, 1, [2, 6]).who, "WHO: read the voiceprint chart");
  assert.deepEqual(G.caseStatus(0.6, 1, 0, 0, true, 0, [2]).options, ["Decide: the line is dead"]);
  assert.match(G.lossAdvice("letIn", 0.7, 3, 0, 0, [2, 6], "front"), /hint, not proof/);
  assert.match(G.lossAdvice("wrongDoor", 0.9, 3, 1, 2, [2, 6], "front"), /odd number/);
});

test("the eraser as call 4: erase calls carry a sign, sorted groups are opposite, unsorted is flat, meter uses them", async () => {
  const G = await J("game.js"), N = await J("nights.js"), Pv = await J("providers.js"), E = await J("evidence.js");
  const night4 = nights.nights[3];
  assert.deepEqual(night4.tools, ["trace", "erase"]);
  assert.deepEqual(nights.nights[1].tools, ["listen"]);
  // the eraser's conditional fringes: + group = listen curve, − group = its mirror, both together flat (any alpha)
  for (const alpha of [60, 90, 120]) for (const theta of [0, 90]) for (let k = 0; k < 8; k++) {
    const e = P.simulateEraser(rad(alpha), rad(theta), P.dialAngle(k), null);
    const l = P.simulate(rad(alpha), rad(theta), P.dialAngle(k), false, null);
    const plus = e["plus|clear"] / (e["plus|clear"] + e["plus|static"]), minus = e["minus|clear"] / (e["minus|clear"] + e["minus|static"]);
    assert.ok(Math.abs(plus - l.clear) < 1e-12 && Math.abs(plus + minus - 1) < 1e-12 && Math.abs(e["plus|clear"] + e["minus|clear"] - 0.5) < 1e-12);
  }
  // a game on call 4: listen is refused, erase records a sign, the meter moves only through the sorted likelihood
  const plan = N.planRun(nights, "erase-seed");
  let s = G.createGame(nights, plan, "erase-seed");
  for (let i = 0; i < 3; i++) { s = G.applyAction(s, { type: "decide", id: "d" + i, choice: "hangup" }, null).state; s = G.applyAction(s, { type: "next", id: "n" + i }, null).state; }
  assert.equal(s.index, 3);
  const prov = Pv.modelProvider(null, R.rngFromSeed("p"), 8);
  assert.match(G.applyAction(s, { type: "call", id: "c0", kind: "listen" }, prov).error, /not available/);
  s = G.applyAction(s, { type: "call", id: "c1", kind: "erase" }, prov).state;
  const r = s.night.log[0];
  assert.equal(r.kind, "erase");
  assert.ok(r.sign === "plus" || r.sign === "minus");
  assert.equal(r.door, undefined);
  // unsorted: every erased call is a coin flip for either caller, so the posterior from the "all" tally is 0.5; sorted it moves
  const unsortedP = E.outcomeProbs(nights, plan[3].alphaDeg, 0, r.dial, "erase");
  assert.ok(Math.abs(unsortedP["plus|clear"] + unsortedP["minus|clear"] - 0.5) < 1e-12);
  // with many sorted erase calls at an informative dial the meter becomes decisive and bags replay by kind
  const bags = { "4|0|erase": Array(10).fill("plus|clear"), "4|0|trace": Array(10).fill("side|clear") };
  const bp = Pv.shotBagProvider({ backendName: "fake", bags }, R.rngFromSeed("q"));
  let t = s;
  for (let i = 0; i < 5; i++) t = G.applyAction(t, { type: "call", id: "e" + i, kind: "erase" }, bp).state;
  const pM = E.posteriorSister(nights, night4, plan[3].alphaDeg, t.night.log.slice(1));
  assert.ok(pM > 0.95, String(pM)); // five plus|clear at dial 0: Mira
  const rows = E.eraserTally(t.night.log, 8);
  assert.equal(rows[0].plus.clear, 5 + (r.dial === 0 && r.sign === "plus" && r.line === "clear" ? 1 : 0));
  assert.equal(E.whoKind(night4), "erase");
  assert.equal(E.whoKind(nights.nights[0]), "listen");
  assert.ok(E.dialInformation(nights, night4, 60).every((x) => x >= 0));
  // a trace on call 4 still records the door
  t = G.applyAction(t, { type: "call", id: "t1", kind: "trace" }, bp).state;
  assert.equal(t.night.log[t.night.log.length - 1].door, "side");
});
