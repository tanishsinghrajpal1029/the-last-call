/**
 * Outcome probabilities for one call, written independently of the Python
 * reference (quantum/model.py) and tested against its table.
 *
 * Gate list (matches quantum/circuits.py):
 *   Ry(alpha) q0; P(theta) q0; P(-phi) q0; [trace: CX q0->q1]; H q0; measure.
 * Outcomes: listen -> "clear" | "static"; trace -> "front|clear" etc.
 */
export const LISTEN_OUTCOMES = ["clear", "static"];
export const TRACE_OUTCOMES = ["front|clear", "front|static", "side|clear", "side|static"];
export function dialAngle(k, steps = 8) {
    if (!Number.isInteger(k) || k < 0 || k >= steps)
        throw new Error("dial position must be 0.." + (steps - 1));
    return (2 * Math.PI * k) / steps;
}
const rad = (deg) => (deg * Math.PI) / 180;
export { rad };
/** Closed-form ideal probabilities. */
export function idealProbabilities(alpha, theta, phi, trace) {
    if (!trace) {
        const pc = (1 + Math.sin(alpha) * Math.cos(theta - phi)) / 2;
        return { clear: pc, static: 1 - pc };
    }
    const pf = Math.cos(alpha / 2) ** 2;
    return { "front|clear": pf / 2, "front|static": pf / 2, "side|clear": (1 - pf) / 2, "side|static": (1 - pf) / 2 };
}
const cz = () => [0, 0];
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const conj = (a) => [a[0], -a[1]];
function zeros(d) {
    return Array.from({ length: d }, () => Array.from({ length: d }, cz));
}
function matmul(a, b) {
    const d = a.length, o = zeros(d);
    for (let i = 0; i < d; i++)
        for (let j = 0; j < d; j++) {
            let s = cz();
            for (let k = 0; k < d; k++)
                s = cadd(s, cmul(a[i][k], b[k][j]));
            o[i][j] = s;
        }
    return o;
}
function dagger(a) {
    const d = a.length, o = zeros(d);
    for (let i = 0; i < d; i++)
        for (let j = 0; j < d; j++)
            o[i][j] = conj(a[j][i]);
    return o;
}
const conjugate = (u, rho) => matmul(matmul(u, rho), dagger(u));
/** 1-qubit 2x2 operator acting on qubit q of an n-qubit register (qubit 0 = lowest index bit). */
function embed(u, q, n) {
    const d = 1 << n, o = zeros(d);
    for (let i = 0; i < d; i++)
        for (let j = 0; j < d; j++) {
            // other bits must match
            if ((i & ~(1 << q)) !== (j & ~(1 << q)))
                continue;
            o[i][j] = u[(i >> q) & 1][(j >> q) & 1];
        }
    return o;
}
function gate1(name, angle) {
    if (name === "ry") {
        const c = Math.cos(angle / 2), s = Math.sin(angle / 2);
        return [[[c, 0], [-s, 0]], [[s, 0], [c, 0]]];
    }
    if (name === "p")
        return [[[1, 0], [0, 0]], [[0, 0], [Math.cos(angle), Math.sin(angle)]]];
    if (name === "h") {
        const r = Math.SQRT1_2;
        return [[[r, 0], [r, 0]], [[r, 0], [-r, 0]]];
    }
    throw new Error("unknown gate " + name);
}
const PAULI = [
    [[[0, 0], [1, 0]], [[1, 0], [0, 0]]],
    [[[0, 0], [0, -1]], [[0, 1], [0, 0]]],
    [[[1, 0], [0, 0]], [[0, 0], [-1, 0]]],
];
function scaleAdd(a, ka, b, kb) {
    return a.map((row, i) => row.map((x, j) => [ka * x[0] + kb * b[i][j][0], ka * x[1] + kb * b[i][j][1]]));
}
const memo = new Map();
/** Exact outcome probabilities (memoised; the game uses a small fixed set of settings). */
export function simulate(alpha, theta, phi, trace, noise) {
    const key = [alpha, theta, phi, trace, noise ? [noise.p1, noise.p2, noise.readout].join() : "-"].join("|");
    const hit = memo.get(key);
    if (hit)
        return { ...hit };
    if (memo.size > 4096)
        memo.clear();
    const out = simulateUncached(alpha, theta, phi, trace, noise);
    memo.set(key, out);
    return { ...out };
}
function simulateUncached(alpha, theta, phi, trace, noise) {
    const n = trace ? 2 : 1, d = 1 << n;
    let rho = zeros(d);
    rho[0][0] = [1, 0];
    const p1 = noise ? noise.p1 : 0, p2 = noise ? noise.p2 : 0, r = noise ? noise.readout : 0;
    const one = (name, angle) => {
        rho = conjugate(embed(gate1(name, angle), 0, n), rho);
        if (p1) {
            let tw = rho;
            for (const P of PAULI)
                tw = scaleAdd(tw, 1, conjugate(embed(P, 0, n), rho), 1);
            rho = scaleAdd(rho, 1 - p1, tw, p1 / 4);
        }
    };
    one("ry", alpha);
    one("p", theta);
    one("p", -phi);
    if (trace) {
        const cx = zeros(4);
        for (let i = 0; i < 4; i++)
            cx[i & 1 ? i ^ 2 : i][i] = [1, 0];
        rho = conjugate(cx, rho);
        if (p2) {
            const mixed = zeros(4);
            for (let i = 0; i < 4; i++)
                mixed[i][i] = [0.25, 0];
            rho = scaleAdd(rho, 1 - p2, mixed, p2);
        }
    }
    one("h", 0);
    const probs = new Array(d).fill(0);
    for (let i = 0; i < d; i++) {
        const p = rho[i][i][0];
        for (let j = 0; j < d; j++) {
            let flips = 0;
            for (let b = i ^ j; b; b >>= 1)
                flips += b & 1;
            probs[j] += p * r ** flips * (1 - r) ** (n - flips);
        }
    }
    const out = {};
    for (let j = 0; j < d; j++) {
        const line = j & 1 ? "static" : "clear";
        const key = trace ? ((j >> 1) & 1 ? "side|" : "front|") + line : line;
        out[key] = (out[key] ?? 0) + probs[j];
    }
    return out;
}
/** Map a sampled index into the outcome list. */
export function sampleOutcome(probs, u) {
    const keys = Object.keys(probs);
    let acc = 0;
    for (const k of keys) {
        acc += probs[k];
        if (u < acc)
            return k;
    }
    return keys[keys.length - 1];
}
