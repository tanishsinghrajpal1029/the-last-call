/**
 * The evidence meter: posterior probability that the caller is Mira, from the
 * calls made so far, comparing two known hypotheses (Mira's phase vs the
 * mimic's offset given in the night intel). Uses the illustrative noise model,
 * so one surprising result is strong but never absolute proof.
 *
 * It only uses the call's lean through sin(alpha), which is the same for both
 * doors, so the meter never reveals which door the call leans toward.
 */

import { CallRecord } from "./game.js";
import { NightConfig, NightsFile } from "./nights.js";
import { dialAngle, rad, simulate } from "./physics.js";

export function posteriorSister(f: NightsFile, cfg: NightConfig, alphaDeg: number, log: CallRecord[], prior = 0.5): number {
  let llr = Math.log(prior / (1 - prior));
  for (const r of log) {
    const phi = dialAngle(r.dial, f.dialSteps);
    const trace = r.kind === "trace";
    const key = trace ? `${r.door}|${r.line}` : r.line;
    const ps = simulate(rad(alphaDeg), rad(f.sisterPhaseDeg), phi, trace, f.noise)[key]!;
    const pm = simulate(rad(alphaDeg), rad(cfg.mimicPhaseDeg), phi, trace, f.noise)[key]!;
    llr += Math.log(ps) - Math.log(pm);
  }
  return 1 / (1 + Math.exp(-llr));
}

/** Expected evidence (nats) one listen at each dial gives, averaged over both hypotheses. */
export function dialInformation(f: NightsFile, cfg: NightConfig, alphaDeg: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < f.dialSteps; k++) {
    const phi = dialAngle(k, f.dialSteps);
    const s = simulate(rad(alphaDeg), rad(f.sisterPhaseDeg), phi, false, f.noise);
    const m = simulate(rad(alphaDeg), rad(cfg.mimicPhaseDeg), phi, false, f.noise);
    let js = 0;
    for (const key of ["clear", "static"]) {
      const a = s[key]!, b = m[key]!, mid = (a + b) / 2;
      js += 0.5 * (a * Math.log(a / mid) + b * Math.log(b / mid));
    }
    out.push(js);
  }
  return out;
}

export function doorTally(log: CallRecord[]): { front: number; side: number } {
  let front = 0, side = 0;
  for (const r of log) if (r.kind === "trace") r.door === "front" ? front++ : side++;
  return { front, side };
}
