/**
 * Pure game rules. The hidden truth (who calls, how the call leans) is fixed in
 * the plan before the first call and never changes. Every committed call
 * consumes exactly one fresh outcome from the provider and one call from the
 * budget; nothing is ever re-rolled.
 */

import { CLEAR_LINES, ResultKind, RESULT_TEXT, STATIC_LINES } from "./lines.js";
import { correctDoor, NightPlan, NightsFile } from "./nights.js";
import { Door, ListenOutcome } from "./physics.js";

/**
 * listen: recombine the two door halves and measure (interference).
 * trace:  record which door on a second qubit, then measure both (door, flat line).
 * erase:  record which door, then read the record in the X basis (+/−) instead
 *         of asking which door; sorted by that reading, the line shows two
 *         opposite interference patterns (the quantum eraser).
 */
export type CallKind = "listen" | "trace" | "erase";
export type Sign = "plus" | "minus";

export interface CallRequest {
  nightId: number;
  alphaDeg: number;
  thetaDeg: number;
  dial: number;
  /** a which-door record is made (trace and erase) */
  trace: boolean;
  /** the record is read in the X basis (erase) */
  eraser: boolean;
}

export interface CallOutcome {
  line: ListenOutcome;
  door?: Door;
  sign?: Sign;
  /** human-readable source, e.g. "ideal model, sampled in browser" or a backend name */
  source: string;
}

/** Supplies one fresh outcome per committed call. May throw (state is then unchanged). */
export type Provider = (req: CallRequest) => CallOutcome;

export interface CallRecord {
  n: number;
  kind: CallKind;
  dial: number;
  line: ListenOutcome;
  door?: Door;
  sign?: Sign;
  text: string;
  source: string;
}

export interface NightState {
  nightId: number;
  budget: number;
  callsLeft: number;
  dial: number;
  log: CallRecord[];
  decision: null | Door | "hangup";
  result: null | ResultKind;
  points: number;
}

export interface GameState {
  seed: string;
  nights: NightsFile;
  plan: NightPlan[];
  index: number;
  night: NightState;
  history: NightState[];
  score: number;
  over: boolean;
  seenActions: string[];
}

export type Action =
  | { type: "dial"; id: string; dial: number }
  | { type: "call"; id: string; kind: CallKind }
  | { type: "decide"; id: string; choice: Door | "hangup" }
  | { type: "next"; id: string };

export interface Step {
  state: GameState;
  error?: string;
  record?: CallRecord;
  result?: ResultKind;
}

export const POINTS = { correct: 100, perCallLeft: 5, wrongDoor: 20, abandoned: 0, letIn: -100 };

function freshNight(f: NightsFile, idx: number): NightState {
  const cfg = f.nights[idx]!;
  return { nightId: cfg.id, budget: cfg.budget, callsLeft: cfg.budget, dial: 0, log: [], decision: null, result: null, points: 0 };
}

export function createGame(nights: NightsFile, plan: NightPlan[], seed: string): GameState {
  if (plan.length !== nights.nights.length) throw new Error("plan does not match nights");
  return { seed, nights, plan, index: 0, night: freshNight(nights, 0), history: [], score: 0, over: false, seenActions: [] };
}

function lineText(s: GameState, rec: Omit<CallRecord, "text">): string {
  const clearCount = s.night.log.filter((r) => r.line === "clear").length;
  const staticCount = s.night.log.filter((r) => r.line === "static").length;
  const words = rec.line === "clear" ? CLEAR_LINES[clearCount % CLEAR_LINES.length]! : STATIC_LINES[staticCount % STATIC_LINES.length]!;
  return words;
}

export function resultFor(plan: NightPlan, choice: Door | "hangup"): ResultKind {
  if (plan.caller === "mimic") return choice === "hangup" ? "refused" : "letIn";
  if (choice === "hangup") return "abandoned";
  const right = correctDoor(plan);
  return right === "either" || right === choice ? "saved" : "wrongDoor";
}

export function pointsFor(result: ResultKind, callsLeft: number): number {
  switch (result) {
    case "saved":
    case "refused":
      return POINTS.correct + POINTS.perCallLeft * callsLeft;
    case "wrongDoor":
      return POINTS.wrongDoor;
    case "abandoned":
      return POINTS.abandoned;
    case "letIn":
      return POINTS.letIn;
  }
}

export function applyAction(s: GameState, a: Action, provider: Provider | null): Step {
  if (s.seenActions.includes(a.id)) return { state: s }; // duplicate delivery: ignored
  const mark = (st: GameState): GameState => ({ ...st, seenActions: [...st.seenActions.slice(-63), a.id] });
  if (s.over) return { state: s, error: "The night is over. Start a new run." };
  const plan = s.plan[s.index]!;
  const n = s.night;

  if (a.type === "dial") {
    if (n.result) return { state: s, error: "This call has ended." };
    if (!Number.isInteger(a.dial) || a.dial < 0 || a.dial >= s.nights.dialSteps) return { state: s, error: "Unknown dial position." };
    return { state: mark({ ...s, night: { ...n, dial: a.dial } }) };
  }

  if (a.type === "call") {
    if (n.result) return { state: s, error: "This call has ended." };
    if (n.callsLeft <= 0) return { state: s, error: "No calls left. Decide: open a door or hang up." };
    if (!provider) return { state: s, error: "No quantum outcomes are available." };
    const cfg = s.nights.nights[s.index]!;
    if (!cfg.tools.includes(a.kind)) return { state: s, error: `${a.kind} is not available on this call.` };
    const eraser = a.kind === "erase", trace = a.kind === "trace" || eraser;
    let out: CallOutcome;
    try {
      out = provider({ nightId: plan.nightId, alphaDeg: plan.alphaDeg, thetaDeg: plan.thetaDeg, dial: n.dial, trace, eraser });
    } catch (e) {
      return { state: s, error: "The call could not be completed: " + (e instanceof Error ? e.message : String(e)) };
    }
    if (out.line !== "clear" && out.line !== "static") throw new Error("invalid outcome");
    if (a.kind === "trace" && out.door !== "front" && out.door !== "side") throw new Error("trace outcome without a door");
    if (eraser && out.sign !== "plus" && out.sign !== "minus") throw new Error("erase outcome without a sign");
    const base = { n: n.log.length + 1, kind: a.kind, dial: n.dial, line: out.line, source: out.source, ...(a.kind === "trace" ? { door: out.door } : {}), ...(eraser ? { sign: out.sign } : {}) };
    const record: CallRecord = { ...base, text: lineText(s, base) };
    const night: NightState = { ...n, callsLeft: n.callsLeft - 1, log: [...n.log, record] };
    return { state: mark({ ...s, night }), record };
  }

  if (a.type === "decide") {
    if (n.result) return { state: s, error: "You already decided." };
    if (!["front", "side", "hangup"].includes(a.choice)) return { state: s, error: "Unknown choice." };
    const result = resultFor(plan, a.choice);
    const points = pointsFor(result, n.callsLeft);
    const night: NightState = { ...n, decision: a.choice, result, points };
    return { state: mark({ ...s, night, score: s.score + points }), result };
  }

  if (a.type === "next") {
    if (!n.result) return { state: s, error: "Decide first." };
    const history = [...s.history, n];
    if (s.index + 1 >= s.nights.nights.length) return { state: mark({ ...s, history, over: true }) };
    return { state: mark({ ...s, history, index: s.index + 1, night: freshNight(s.nights, s.index + 1) }) };
  }
  return { state: s, error: "Unknown action." };
}

export function resultText(r: ResultKind): string {
  return RESULT_TEXT[r];
}

/** What the player may see: never the plan, until the night is decided. */
export function publicView(s: GameState) {
  const cfg = s.nights.nights[s.index]!;
  const plan = s.plan[s.index]!;
  return {
    night: cfg,
    state: s.night,
    score: s.score,
    over: s.over,
    revealed: s.night.result ? { caller: plan.caller, door: correctDoor(plan) } : null,
  };
}
