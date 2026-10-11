/**
 * Bonus scene: the quantum eraser. Every call is traced (the door is recorded
 * on a second qubit), so the ordinary voiceprint is gone. The eraser reads that
 * record in the X basis instead of asking "which door"; sorting the shots by
 * its reading (+ / −) brings back two opposite voiceprints. The + group's
 * pattern tells you who is calling. Nothing is sent back in time: the groups
 * only appear after sorting, and both groups together stay flat.
 */

import { Noise, rad, sampleOutcome, simulateEraser } from "./physics.js";
import { rngFromSeed, Rng, shuffled } from "./rng.js";

export interface BonusConfig {
  title: string;
  alphaDeg: number;
  mimicPhaseDeg: number;
  sweeps: number;
  shotsPerDial: number;
  intel: string;
}

export type EraserOutcome = "plus|clear" | "plus|static" | "minus|clear" | "minus|static";
export type BonusChoice = "front" | "side" | "hangup";
export type BonusResult = "saved" | "refused" | "letIn" | "abandoned";

export interface BonusState {
  caller: "sister" | "mimic";
  thetaDeg: number;
  sweepsLeft: number;
  /** shots per dial setting, in the order measured */
  shots: EraserOutcome[][];
  sorted: boolean;
  result: BonusResult | null;
  points: number;
}

/** One sweep: `shotsPerDial` fresh shots at each dial setting. May throw. */
export type BonusProvider = (dial: number, n: number) => EraserOutcome[];

export function createBonus(cfg: BonusConfig, seed: string, steps = 8, sisterPhaseDeg = 0): BonusState {
  const caller = rngFromSeed("bonus:" + seed)() < 0.5 ? "sister" : "mimic";
  return { caller, thetaDeg: caller === "sister" ? sisterPhaseDeg : cfg.mimicPhaseDeg, sweepsLeft: cfg.sweeps, shots: Array.from({ length: steps }, () => []), sorted: false, result: null, points: 0 };
}

export function modelBonusProvider(cfg: BonusConfig, state: () => BonusState, noise: Noise | null, rng: Rng, steps = 8): BonusProvider {
  return (dial, n) => {
    const p = simulateEraser(rad(cfg.alphaDeg), rad(state().thetaDeg), (2 * Math.PI * dial) / steps, noise);
    return Array.from({ length: n }, () => sampleOutcome(p, rng()) as EraserOutcome);
  };
}

/** Replays measured shots from Qollab: key = dial, each shot used once. */
export function bagBonusProvider(bags: Record<number, EraserOutcome[]>, rng: Rng): BonusProvider {
  const q = new Map(Object.entries(bags).map(([k, v]) => [Number(k), shuffled(v, rng)]));
  return (dial, n) => {
    const list = q.get(dial);
    if (!list || list.length < n) throw new Error("not enough measured shots for another sweep; press Run again on Qollab");
    return list.splice(0, n);
  };
}

export function sweep(s: BonusState, cfg: BonusConfig, p: BonusProvider): { state: BonusState; error?: string } {
  if (s.result) return { state: s, error: "This call has ended." };
  if (s.sweepsLeft <= 0) return { state: s, error: "No sweeps left. Decide." };
  let got: EraserOutcome[][];
  try {
    got = s.shots.map((_, dial) => p(dial, cfg.shotsPerDial));
  } catch (e) {
    return { state: s, error: e instanceof Error ? e.message : String(e) };
  }
  const ok = ["plus|clear", "plus|static", "minus|clear", "minus|static"];
  if (got.some((g) => g.length !== cfg.shotsPerDial || g.some((o) => !ok.includes(o)))) throw new Error("invalid eraser outcome");
  return { state: { ...s, sweepsLeft: s.sweepsLeft - 1, shots: s.shots.map((list, d) => [...list, ...got[d]!]) } };
}

export function sortGroups(s: BonusState): BonusState {
  return s.shots.some((x) => x.length) ? { ...s, sorted: true } : s;
}

export function decideBonus(s: BonusState, choice: BonusChoice, cfg: BonusConfig): BonusState {
  if (s.result) return s;
  const result: BonusResult = s.caller === "mimic" ? (choice === "hangup" ? "refused" : "letIn") : choice === "hangup" ? "abandoned" : "saved";
  const points = result === "saved" || result === "refused" ? 100 + 20 * s.sweepsLeft : result === "letIn" ? -100 : 0;
  void cfg;
  return { ...s, result, points };
}

/** Clear-line fraction per dial for: all shots, the + group, the − group. */
export function eraserRows(s: BonusState) {
  return s.shots.map((list, dial) => {
    const count = (f: (o: EraserOutcome) => boolean) => list.filter(f).length;
    const plus = count((o) => o.startsWith("plus")), minus = list.length - plus;
    return {
      dial,
      all: { clear: count((o) => o.endsWith("clear")), total: list.length },
      plus: { clear: count((o) => o === "plus|clear"), total: plus },
      minus: { clear: count((o) => o === "minus|clear"), total: minus },
    };
  });
}

/** Chance it's Mira from the + / − sorted shots (two known hypotheses). */
export function bonusPosterior(s: BonusState, cfg: BonusConfig, noise: Noise | null, sisterPhaseDeg = 0, steps = 8): number {
  let llr = 0;
  s.shots.forEach((list, dial) => {
    const phi = (2 * Math.PI * dial) / steps;
    const a = simulateEraser(rad(cfg.alphaDeg), rad(sisterPhaseDeg), phi, noise);
    const b = simulateEraser(rad(cfg.alphaDeg), rad(cfg.mimicPhaseDeg), phi, noise);
    for (const o of list) llr += Math.log(Math.max(1e-12, a[o]!)) - Math.log(Math.max(1e-12, b[o]!));
  });
  return 1 / (1 + Math.exp(-Math.max(-700, Math.min(700, llr))));
}
