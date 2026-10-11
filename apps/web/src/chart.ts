/** Evidence chart (SVG): clear-line rate per dial setting vs the two hypotheses. */

import { CallRecord } from "../../../packages/core/src/game.js";
import { NightConfig, NightsFile } from "../../../packages/core/src/nights.js";
import { eraserTally, whoKind } from "../../../packages/core/src/evidence.js";
import { rad, simulate } from "../../../packages/core/src/physics.js";

export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/**
 * `sorted` matters only on an eraser night: unsorted, every erased call is
 * plotted together (flat, as physics demands); sorted, the + group is plotted
 * as it is and the − group flipped (1 − clear rate), because its pattern is the
 * mirror image. Both then follow the same two voiceprints.
 */
export function evidenceChart(f: NightsFile, cfg: NightConfig, alphaDeg: number, log: CallRecord[], dial: number, sorted = true): string {
  const eraser = whoKind(cfg) === "erase";
  const W = 340, H = 190, L = 34, R = 10, T = 14, B = 34;
  const steps = f.dialSteps;
  const x = (k: number) => L + (k / (steps - 1)) * (W - L - R);
  const y = (p: number) => T + (1 - p) * (H - T - B);
  const curve = (thetaDeg: number) => {
    let d = "";
    for (let i = 0; i <= 70; i++) {
      const k = (i / 70) * (steps - 1);
      const p = simulate(rad(alphaDeg), rad(thetaDeg), (2 * Math.PI * k) / steps, false, f.noise)["clear"]!;
      d += (d ? " L" : "M") + x(k).toFixed(1) + " " + y(p).toFixed(1);
    }
    return d;
  };
  const pts: string[] = [];
  const dot = (k: number, c: number, n: number, cls: string, label: string, dx = 0, flip = false) => {
    if (!n) return;
    const p = flip ? 1 - c / n : c / n;
    const [lo, hi] = wilson(flip ? n - c : c, n);
    pts.push(`<line x1="${x(k) + dx}" x2="${x(k) + dx}" y1="${y(lo)}" y2="${y(hi)}" class="ch-err"/>
      <circle cx="${x(k) + dx}" cy="${y(p)}" r="5.5" class="${cls}"><title>Dial ${k}, ${label}: ${c} clear of ${n}${flip ? " (plotted flipped)" : ""}</title></circle>
      <text x="${x(k) + dx + 7}" y="${y(p) - 6}" class="ch-n">${c}/${n}</text>`);
  };
  if (!eraser) {
    for (let k = 0; k < steps; k++) {
      const calls = log.filter((r) => r.kind === "listen" && r.dial === k);
      dot(k, calls.filter((r) => r.line === "clear").length, calls.length, "ch-pt", "listens");
    }
  } else {
    for (const row of eraserTally(log, steps)) {
      if (!sorted) dot(row.dial, row.all.clear, row.all.total, "ch-pt pt-all", "all erased calls");
      else {
        dot(row.dial, row.plus.clear, row.plus.total, "ch-pt pt-plus", "+ group", -4);
        dot(row.dial, row.minus.clear, row.minus.total, "ch-pt pt-minus", "− group, flipped", 4, true);
      }
    }
  }
  const legend = !eraser
    ? `<span class="lg-item"><span class="lg-pt"></span> your listens</span>`
    : !sorted
    ? `<span class="lg-item"><span class="lg-pt"></span> all erased calls together (unsorted: flat)</span>`
    : `<span class="lg-item"><span class="lg-pt pt-plus-l"></span> + group</span><span class="lg-item"><span class="lg-pt pt-minus-l"></span> − group, plotted flipped (its pattern is the mirror image)</span>`;
  const ticks = Array.from({ length: steps }, (_, k) =>
    `<text x="${x(k)}" y="${H - B + 15}" text-anchor="middle" class="ch-t${k === dial ? " ch-cur" : ""}">${k}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Clear-line rate by dial setting. Solid line: what Mira's call would give. Dashed: what the mimic would give. Dots: your ${eraser ? (sorted ? "erased calls, sorted by the eraser's reading" : "erased calls, unsorted") : "listens"}.">
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
  <p class="legend"><span class="lg-item"><span class="lg-sister"></span> Mira's voiceprint</span><span class="lg-item"><span class="lg-mimic"></span> impostor's voiceprint</span>${legend}</p>`;
}
