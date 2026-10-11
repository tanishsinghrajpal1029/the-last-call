/** Night configuration (shared/nights.json) and per-run hidden choices. */

import { Noise, rad } from "./physics.js";
import { rngFromSeed } from "./rng.js";

export interface NightConfig {
  id: number;
  title: string;
  budget: number;
  alphaChoicesDeg: number[];
  mimicPhaseDeg: number;
  identity: "sister" | "mimic" | "random";
  tutorial: boolean;
  /** which calls the intercom can make this night (see game.ts CallKind) */
  tools: ("listen" | "trace" | "erase")[];
  /** what is new on this call, in one line (shown and spoken before it starts) */
  rule: string;
  intel: string;
}

export interface NightsFile {
  version: string;
  dialSteps: number;
  sisterPhaseDeg: number;
  noise: Noise & { label: string };
  nights: NightConfig[];
}

export type Caller = "sister" | "mimic";

/** Hidden truth for one night, fixed before the first call. */
export interface NightPlan {
  nightId: number;
  caller: Caller;
  alphaDeg: number;
  thetaDeg: number;
}

export function validateNights(f: NightsFile): string[] {
  const e: string[] = [];
  if (!f || !Array.isArray(f.nights) || !f.nights.length) return ["no nights"];
  if (!Number.isInteger(f.dialSteps) || f.dialSteps < 2) e.push("dialSteps");
  for (const n of f.nights) {
    if (!(n.budget >= 1)) e.push("budget " + n.id);
    if (!n.alphaChoicesDeg.length || n.alphaChoicesDeg.some((a) => !(a > 0 && a < 180))) e.push("alpha " + n.id);
    if (!["sister", "mimic", "random"].includes(n.identity)) e.push("identity " + n.id);
    if (!Array.isArray(n.tools) || !n.tools.length || n.tools.some((t) => !["listen", "trace", "erase"].includes(t))) e.push("tools " + n.id);
    // a call whose lean matters must be traceable, or the right door could never be found
    if (n.alphaChoicesDeg.some((a) => Math.abs(a - 90) > 1e-9) && !n.tools.includes("trace")) e.push("leaning call without trace " + n.id);
    // the meter and chart use |sin(alpha)|; every choice in a night must share it, or the curves would reveal the lean
    const vis = n.alphaChoicesDeg.map((a) => Math.abs(Math.sin((a * Math.PI) / 180)));
    if (vis.some((v) => Math.abs(v - vis[0]!) > 1e-9)) e.push("alpha choices must share |sin(alpha)| " + n.id);
  }
  for (const k of ["p1", "p2", "readout"] as const) {
    const v = f.noise[k];
    if (!(v >= 0 && v < 0.5)) e.push("noise " + k);
  }
  return e;
}

/** Choose who calls and how the call leans, per night, from the run seed. */
export function planRun(f: NightsFile, seed: string): NightPlan[] {
  const rng = rngFromSeed("plan:" + seed);
  return f.nights.map((n) => {
    const caller: Caller = n.identity === "random" ? (rng() < 0.5 ? "sister" : "mimic") : n.identity;
    const alphaDeg = n.alphaChoicesDeg[Math.floor(rng() * n.alphaChoicesDeg.length)]!;
    return { nightId: n.id, caller, alphaDeg, thetaDeg: caller === "sister" ? f.sisterPhaseDeg : n.mimicPhaseDeg };
  });
}

/** Which door is right if the caller is Mira: the more likely one, or either if balanced. */
export function correctDoor(plan: NightPlan): "front" | "side" | "either" {
  const pf = Math.cos(rad(plan.alphaDeg) / 2) ** 2;
  if (Math.abs(pf - 0.5) < 1e-9) return "either";
  return pf > 0.5 ? "front" : "side";
}
