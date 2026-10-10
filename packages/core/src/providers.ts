/**
 * Where call outcomes come from.
 *
 * modelProvider: samples the exact ideal (or illustrative-noise) probabilities
 *   in the browser. Labelled as such; not a quantum computer.
 * shotBagProvider: replays measured shots from a Qollab backend run, one shot
 *   per call, each shot used at most once, in a seeded random order.
 */

import { CallOutcome, CallRequest, Provider } from "./game.js";
import { dialAngle, Noise, rad, sampleOutcome, simulate } from "./physics.js";
import { Rng, shuffled } from "./rng.js";

export function modelProvider(noise: Noise | null, rng: Rng, steps = 8): Provider {
  const source = noise ? "illustrative noise model, sampled in your browser" : "ideal model, sampled in your browser";
  return (req: CallRequest): CallOutcome => {
    const probs = simulate(rad(req.alphaDeg), rad(req.thetaDeg), dialAngle(req.dial, steps), req.trace, noise);
    return toOutcome(sampleOutcome(probs, rng()), source);
  };
}

export function toOutcome(key: string, source: string): CallOutcome {
  if (key === "clear" || key === "static") return { line: key, source };
  const [door, line] = key.split("|");
  if ((door === "front" || door === "side") && (line === "clear" || line === "static")) return { line, door, source };
  throw new Error("unknown outcome " + key);
}

export const bagKey = (nightId: number, dial: number, trace: boolean) => `${nightId}|${dial}|${trace ? "trace" : "listen"}`;

export interface ShotBags {
  backendName: string;
  /** bagKey -> list of decoded outcome keys, one per measured shot */
  bags: Record<string, string[]>;
}

export function shotBagProvider(data: ShotBags, rng: Rng): Provider & { remaining: (k: string) => number } {
  const queues = new Map<string, string[]>();
  for (const [k, v] of Object.entries(data.bags)) queues.set(k, shuffled(v, rng));
  const source = "measured shot from " + data.backendName;
  const p = ((req: CallRequest): CallOutcome => {
    const q = queues.get(bagKey(req.nightId, req.dial, req.trace));
    if (!q || !q.length) throw new Error("no measured shots left for this setting; press Run again on Qollab");
    return toOutcome(q.shift()!, source);
  }) as Provider & { remaining: (k: string) => number };
  p.remaining = (k: string) => queues.get(k)?.length ?? 0;
  return p;
}

/** Expand decoded totals {outcome: count} into a list of shots. */
export function expandCounts(totals: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [k, c] of Object.entries(totals)) {
    if (!Number.isInteger(c) || c < 0) throw new Error("counts must be non-negative integers");
    for (let i = 0; i < c; i++) out.push(k);
  }
  return out;
}
