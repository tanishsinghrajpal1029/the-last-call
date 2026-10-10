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
    const args = [rad(r.alphaDeg), rad(r.thetaDeg), P.dialAngle(r.dial), r.trace];
    const ideal = P.simulate(...args, null);
    const noisy = P.simulate(...args, nights.noise);
    const formula = P.idealProbabilities(...args);
    for (const k of Object.keys(r.ideal)) {
      assert.ok(Math.abs(ideal[k] - r.ideal[k]) < 1e-12, `ideal ${k}`);
      assert.ok(Math.abs(formula[k] - r.ideal[k]) < 1e-12, `formula ${k}`);
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
  const bags = { [V.bagKey(1, 0, false)]: V.expandCounts({ clear: 2, static: 1 }), [V.bagKey(1, 0, true)]: ["side|static"] };
  const prov = V.shotBagProvider({ backendName: "test backend", bags }, R.rngFromSeed("b"));
  const req = { nightId: 1, alphaDeg: 90, thetaDeg: 0, dial: 0, trace: false };
  const got = [prov(req), prov(req), prov(req)].map((o) => o.line).sort();
  assert.deepEqual(got, ["clear", "clear", "static"]);
  assert.throws(() => prov(req), /no measured shots/);
  assert.deepEqual(prov({ ...req, trace: true }), { line: "static", door: "side", source: "measured shot from test backend" });
  assert.throws(() => V.expandCounts({ clear: 1.5 }));
  const sampled = V.shotBagProvider({ backendName: "ionq", sampledFromProbabilities: true, bags: { [V.bagKey(1, 0, false)]: ["clear"] } }, R.rngFromSeed("c"));
  assert.match(sampled(req).source, /sampled from ionq's returned probabilities/);
});

test("evidence: listening moves the meter, tracing never does", () => {
  const cfg = nights.nights[1];
  const rec = (kind, dial, line, door) => ({ n: 1, kind, dial, line, door, text: "", source: "t" });
  assert.equal(E.posteriorSister(nights, cfg, 90, []), 0.5);
  assert.ok(E.posteriorSister(nights, cfg, 90, [rec("listen", 0, "static")]) < 0.05);
  assert.ok(E.posteriorSister(nights, cfg, 90, [rec("listen", 0, "clear")]) > 0.95);
  const t = E.posteriorSister(nights, cfg, 90, [rec("trace", 0, "clear", "front"), rec("trace", 3, "static", "side")]);
  assert.ok(Math.abs(t - 0.5) < 1e-12);
  // same meter whichever door the call leans to
  const c4 = nights.nights[3];
  const log = [rec("listen", 7, "clear"), rec("listen", 6, "static")];
  assert.ok(Math.abs(E.posteriorSister(nights, c4, 60, log) - E.posteriorSister(nights, c4, 120, log)) < 1e-12);
});

test("dial information: on the last night the best dials are not Mira's own setting", () => {
  const info = E.dialInformation(nights, nights.nights[3], 60);
  const best = Math.max(...info);
  assert.ok(info[0] < best * 0.5, "dial 0 is a weak test");
  assert.ok([2, 3, 6, 7].includes(info.indexOf(best)));
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
