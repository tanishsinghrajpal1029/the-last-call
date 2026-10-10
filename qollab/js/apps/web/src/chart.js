/** Evidence chart (SVG): clear-line rate per dial setting vs the two hypotheses. */
import { rad, simulate } from "../../../packages/core/src/physics.js";
export function wilson(k, n, z = 1.96) {
    if (!n)
        return [0, 1];
    const p = k / n, d = 1 + (z * z) / n;
    const c = (p + (z * z) / (2 * n)) / d;
    const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
}
export function evidenceChart(f, cfg, alphaDeg, log, dial) {
    const W = 340, H = 190, L = 34, R = 10, T = 14, B = 34;
    const steps = f.dialSteps;
    const x = (k) => L + (k / (steps - 1)) * (W - L - R);
    const y = (p) => T + (1 - p) * (H - T - B);
    const curve = (thetaDeg) => {
        let d = "";
        for (let i = 0; i <= 70; i++) {
            const k = (i / 70) * (steps - 1);
            const p = simulate(rad(alphaDeg), rad(thetaDeg), (2 * Math.PI * k) / steps, false, f.noise)["clear"];
            d += (d ? " L" : "M") + x(k).toFixed(1) + " " + y(p).toFixed(1);
        }
        return d;
    };
    const pts = [];
    for (let k = 0; k < steps; k++) {
        const calls = log.filter((r) => r.kind === "listen" && r.dial === k);
        if (!calls.length)
            continue;
        const c = calls.filter((r) => r.line === "clear").length;
        const [lo, hi] = wilson(c, calls.length);
        pts.push(`<line x1="${x(k)}" x2="${x(k)}" y1="${y(lo)}" y2="${y(hi)}" class="ch-err"/>
      <circle cx="${x(k)}" cy="${y(c / calls.length)}" r="5.5" class="ch-pt"><title>Dial ${k}: ${c} clear of ${calls.length}</title></circle>
      <text x="${x(k) + 7}" y="${y(c / calls.length) - 6}" class="ch-n">${c}/${calls.length}</text>`);
    }
    const ticks = Array.from({ length: steps }, (_, k) => `<text x="${x(k)}" y="${H - B + 15}" text-anchor="middle" class="ch-t${k === dial ? " ch-cur" : ""}">${k}</text>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Clear-line rate by dial setting. Solid line: what Mira's call would give. Dashed: what the mimic would give. Dots: your listens.">
    <rect x="${x(dial) - 9}" y="${T}" width="18" height="${H - T - B}" class="ch-dial"/>
    <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="ch-axis"/>
    <line x1="${L}" x2="${L}" y1="${y(0)}" y2="${y(1)}" class="ch-axis"/>
    <line x1="${L}" x2="${W - R}" y1="${y(0.5)}" y2="${y(0.5)}" class="ch-grid"/>
    <text x="${L - 5}" y="${y(1) + 4}" text-anchor="end" class="ch-t">100%</text>
    <text x="${L - 5}" y="${y(0.5) + 4}" text-anchor="end" class="ch-t">50%</text>
    <text x="${L - 5}" y="${y(0) + 4}" text-anchor="end" class="ch-t">0%</text>
    <path d="${curve(f.sisterPhaseDeg)}" class="ch-sister"/>
    <path d="${curve(cfg.mimicPhaseDeg)}" class="ch-mimic"/>
    ${pts.join("")}${ticks}
    <text x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle" class="ch-t">dial setting · y: how often the line came through clear</text>
  </svg>
  <p class="legend"><span class="lg-sister"></span> if it's Mira <span class="lg-mimic"></span> if it isn't <span class="lg-pt"></span> your listens (with 95% range)</p>`;
}
