/**
 * The evidence meter: posterior probability that the caller is Mira, from the
 * calls made so far, comparing two known hypotheses (Mira's phase vs the
 * mimic's offset given in the night intel). Uses the illustrative noise model,
 * so one surprising result is strong but never absolute proof.
 *
 * It only uses the call's lean through sin(alpha), which is the same for both
 * doors, so the meter never reveals which door the call leans toward.
 */
import { dialAngle, rad, simulate, simulateEraser } from "./physics.js";
/** Outcome probabilities for one call kind under one hypothesis. */
export function outcomeProbs(f, alphaDeg, thetaDeg, dial, kind) {
    const phi = dialAngle(dial, f.dialSteps);
    return kind === "erase" ? simulateEraser(rad(alphaDeg), rad(thetaDeg), phi, f.noise) : simulate(rad(alphaDeg), rad(thetaDeg), phi, kind === "trace", f.noise);
}
export function outcomeKey(r) {
    return r.kind === "trace" ? `${r.door}|${r.line}` : r.kind === "erase" ? `${r.sign}|${r.line}` : r.line;
}
export function posteriorSister(f, cfg, alphaDeg, log, prior = 0.5) {
    let llr = Math.log(prior / (1 - prior));
    for (const r of log) {
        const key = outcomeKey(r);
        const ps = outcomeProbs(f, alphaDeg, f.sisterPhaseDeg, r.dial, r.kind)[key];
        const pm = outcomeProbs(f, alphaDeg, cfg.mimicPhaseDeg, r.dial, r.kind)[key];
        llr += Math.log(ps) - Math.log(pm);
    }
    return 1 / (1 + Math.exp(-llr));
}
/**
 * Expected evidence (nats) one WHO call at each dial gives, averaged over both
 * hypotheses (Jensen–Shannon divergence). The WHO call is listen, or erase on a
 * night where every call is recorded.
 */
export function dialInformation(f, cfg, alphaDeg) {
    const kind = whoKind(cfg);
    const out = [];
    for (let k = 0; k < f.dialSteps; k++) {
        const s = outcomeProbs(f, alphaDeg, f.sisterPhaseDeg, k, kind);
        const m = outcomeProbs(f, alphaDeg, cfg.mimicPhaseDeg, k, kind);
        let js = 0;
        for (const key of Object.keys(s)) {
            const a = s[key], b = m[key], mid = (a + b) / 2;
            if (a > 0)
                js += 0.5 * a * Math.log(a / mid);
            if (b > 0)
                js += 0.5 * b * Math.log(b / mid);
        }
        out.push(js);
    }
    return out;
}
/** The call that identifies the caller on this night. */
export function whoKind(cfg) {
    return cfg.tools.includes("listen") ? "listen" : "erase";
}
/** Clear-line counts per dial for the sorted eraser groups and for all erased calls together. */
export function eraserTally(log, steps) {
    return Array.from({ length: steps }, (_, dial) => {
        const list = log.filter((r) => r.kind === "erase" && r.dial === dial);
        const grp = (sign) => {
            const g = list.filter((r) => r.sign === sign);
            return { clear: g.filter((r) => r.line === "clear").length, total: g.length };
        };
        return { dial, all: { clear: list.filter((r) => r.line === "clear").length, total: list.length }, plus: grp("plus"), minus: grp("minus") };
    });
}
export function doorTally(log) {
    let front = 0, side = 0;
    for (const r of log)
        if (r.kind === "trace")
            r.door === "front" ? front++ : side++;
    return { front, side };
}
