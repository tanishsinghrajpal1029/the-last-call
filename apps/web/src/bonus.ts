/**
 * Bonus scene UI: the quantum eraser, in three guided steps.
 *   1. Sweep: every call is traced, so the voiceprint is flat (no pattern).
 *   2. Sort by the eraser's reading (+ / −): two opposite voiceprints appear.
 *   3. Read the + group and decide.
 */

import { BonusConfig, BonusProvider, BonusState, bonusPosterior, createBonus, decideBonus, eraserRows, sortGroups, sweep } from "../../../packages/core/src/bonus.js";
import { Noise, rad, simulateEraser } from "../../../packages/core/src/physics.js";
import { drawFigure, drawMimicFace, drawPorch, postProcess } from "./art.js";
import { Audio } from "./audio.js";
import { wilson } from "./chart.js";

const RESULT_TEXT = {
  saved: "The lock turns. Mira comes in shaking. “How did you know it was me? It was all crackly.”",
  refused: "You hang up. Somewhere outside, something tries her voice one more time, then gives up.",
  letIn: "The door opens on nothing. Then the hallway light goes out behind you.",
  abandoned: "You hang up on your own little sister. The pattern said it was her.",
} as const;

export class BonusView {
  readonly root: HTMLElement;
  private s: BonusState;
  private canvas: HTMLCanvasElement;
  private raf = 0;
  private alive = true;
  private resultAt = -1;
  private provider: BonusProvider;
  onExit: (() => void) | null = null;

  constructor(parent: HTMLElement, private cfg: BonusConfig, seed: string, makeProvider: (state: () => BonusState) => BonusProvider,
    private sourceLabel: string, private noise: Noise | null, private audio: Audio, private gentle: boolean, private calm: boolean) {
    this.s = createBonus(cfg, seed);
    this.provider = makeProvider(() => this.s);
    this.root = document.createElement("div");
    this.root.className = "ui bonus";
    parent.appendChild(this.root);
    this.root.innerHTML = `
      <header class="top"><span class="chip">${cfg.title}</span><span class="chip" id="b-sweeps"></span>
        <span class="top-buttons"><button type="button" class="btn btn-ghost" id="b-exit">Exit</button></span></header>
      <div class="col-left"><aside class="guide"><ol class="stepper" id="b-stepper"></ol><div class="guide-card" id="b-card" aria-live="polite"></div></aside></div>
      <div class="col-right">
        <canvas class="feed" id="b-feed" width="760" height="300" role="img" aria-label="Both door cameras. Every call tonight is traced."></canvas>
        <section class="casefile"><h2 class="ev-h">Voiceprint after the eraser</h2><div id="b-chart"></div><div id="b-meter"></div></section>
        <section class="controls">
          <div class="call-row"><button type="button" class="btn btn-primary" id="b-sweep">Sweep all dials <span class="sub">${cfg.shotsPerDial} traced calls at each of 8 settings</span></button>
            <button type="button" class="btn btn-trace" id="b-sort">Sort by the eraser's reading <span class="sub">split into + and − groups</span></button></div>
          <div class="decide-row"><button type="button" class="btn btn-door" id="b-front">Open front door</button><button type="button" class="btn btn-door" id="b-side">Open side door</button><button type="button" class="btn btn-hang" id="b-hang">Hang up</button></div>
          <p class="sub">Outcomes: ${sourceLabel}.</p>
        </section>
      </div>`;
    this.canvas = this.root.querySelector("#b-feed")!;
    const on = (id: string, fn: () => void) => this.root.querySelector("#" + id)!.addEventListener("click", (e) => { e.preventDefault(); this.audio.unlock(); fn(); });
    on("b-exit", () => this.onExit?.());
    on("b-sweep", () => {
      const r = sweep(this.s, this.cfg, this.provider);
      if (!r.error) { this.s = r.state; this.audio.lineOpen(); this.audio.staticBurst(); }
      this.render();
      if (r.error) this.note(r.error);
    });
    on("b-sort", () => { this.s = sortGroups(this.s); this.audio.dial(); this.render(); });
    const decide = (c: "front" | "side" | "hangup") => {
      if (!this.s.sorted || this.s.result) return;
      this.s = decideBonus(this.s, c, this.cfg);
      this.resultAt = performance.now() / 1000;
      const res = this.s.result!;
      if (res === "letIn") { this.audio.door(); setTimeout(() => { if (!this.alive) return; this.audio.stinger(); void this.audio.voiceLine("mimic_thanks", "Thank you.", true); }, 900); }
      else if (res === "refused") void this.audio.voiceLine("mimic_next", "Next time.", true);
      else if (res === "saved") { this.audio.door(); this.audio.relief(); void this.audio.voiceLine("res_saved", "You took forever."); }
      this.render();
    };
    on("b-front", () => decide("front"));
    on("b-side", () => decide("side"));
    on("b-hang", () => decide("hangup"));
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  }

  private note(msg: string): void {
    const c = this.root.querySelector("#b-card")!;
    c.insertAdjacentHTML("afterbegin", `<p class="do">${msg}</p>`);
  }

  private step(): number {
    if (this.s.result) return 3;
    if (this.s.sorted) return 2;
    if (this.s.shots[0]!.length) return 1;
    return 0;
  }

  private render(): void {
    const s = this.s, st = this.step();
    (this.root.querySelector("#b-sweeps") as HTMLElement).textContent = `Sweeps left ${s.sweepsLeft}`;
    const names = ["Sweep", "Sort", "Decide"];
    this.root.querySelector("#b-stepper")!.innerHTML = names.map((n, i) => `<li class="${i < st ? "done" : i === st ? "now" : ""}"><span class="num">${i < st ? "✓" : i + 1}</span>${n}</li>`).join("");
    const card = this.root.querySelector("#b-card")!;
    const steps = [
      { t: "Every call is traced", d: "Press <strong>Sweep all dials</strong>.", b: `${this.cfg.intel} A trace records the door on a second qubit, so the voice comes through as a coin flip at every dial: no voiceprint, no way to tell who it is.`, q: "The which-door record is entangled with the call. While that record exists, the two door paths can't interfere." },
      { t: "Flat. Now use the eraser", d: "See the flat grey dots? Now press <strong>Sort by the eraser's reading</strong>.", b: "The eraser reads the door record in a way that can't tell front from side. It gives a + or − for each call. Sorting the calls you already have into + and − groups may reveal something.", q: "Measuring the record in the X basis (a Hadamard on the record qubit) erases the which-door information. Nothing changes in the past: the shots are the same, only grouped." },
      { t: "Two voiceprints came back", d: "Read the <strong>+ group</strong> (teal dots). Clearest at dial 0 → Mira: open a door. Clearest at dial 4 → impostor: hang up.", b: "The + group and the − group show opposite patterns that cancel when added together, which is why the sweep looked flat. The + group has the caller's real voiceprint.", q: "Conditional interference: given the eraser's + result, the call's two paths interfere again. Tonight either door is right for Mira." },
      { t: s.result === "saved" || s.result === "refused" ? "You chose right" : "Wrong call", d: RESULT_TEXT[s.result ?? "saved"], b: `It was ${s.caller === "sister" ? "Mira" : "the impostor"}. Points: ${s.points >= 0 ? "+" : ""}${s.points}.`, q: "The eraser didn't undo the measurement. It chose a question about the record that carries no door information, and that let the pattern show inside each group." },
    ][st]!;
    card.innerHTML = `<p class="tag">Bonus · step ${Math.min(st + 1, 3)} of 3</p><h2>${steps.t}</h2><p class="do">${steps.d}</p><p>${steps.b}</p><p class="quantum"><span class="qtag">Quantum</span> ${steps.q}</p>
      ${s.result ? `<div class="sheet-buttons"><button type="button" class="btn btn-primary" id="b-done">Back to the start</button></div>` : ""}`;
    card.querySelector("#b-done")?.addEventListener("click", () => this.onExit?.());
    const dis = (id: string, v: boolean) => ((this.root.querySelector("#" + id) as HTMLButtonElement).disabled = v);
    dis("b-sweep", !!s.result || s.sweepsLeft <= 0);
    dis("b-sort", !!s.result || s.sorted || !s.shots[0]!.length);
    for (const id of ["b-front", "b-side", "b-hang"]) dis(id, !s.sorted || !!s.result);
    for (const b of this.root.querySelectorAll(".hl")) b.classList.remove("hl");
    const target = st === 0 ? "b-sweep" : st === 1 ? "b-sort" : null;
    if (target) this.root.querySelector("#" + target)!.classList.add("hl");
    this.root.querySelector("#b-chart")!.innerHTML = this.chart();
    const p = s.sorted ? bonusPosterior(s, this.cfg, this.noise) : 0.5;
    const shown = p > 0.99 ? "over 99%" : p < 0.01 ? "under 1%" : Math.round(100 * p) + "%";
    this.root.querySelector("#b-meter")!.innerHTML = `<p class="sub">${s.sorted ? `Chance it's Mira from the sorted groups: <strong>${shown}</strong>.` : "Unsorted traced calls carry no information about who it is (50/50)."}</p>`;
  }

  private chart(): string {
    const W = 360, H = 200, L = 34, R = 10, T = 12, B = 34, steps = 8;
    const x = (k: number) => L + (k / (steps - 1)) * (W - L - R);
    const y = (p: number) => T + (1 - p) * (H - T - B);
    const curve = (thetaDeg: number) => {
      let d = "";
      for (let i = 0; i <= 70; i++) {
        const k = (i / 70) * (steps - 1);
        const pr = simulateEraser(rad(this.cfg.alphaDeg), rad(thetaDeg), (2 * Math.PI * k) / steps, null);
        const v = pr["plus|clear"]! / (pr["plus|clear"]! + pr["plus|static"]!);
        d += (d ? " L" : "M") + x(k).toFixed(1) + " " + y(v).toFixed(1);
      }
      return d;
    };
    const rows = eraserRows(this.s);
    const dot = (k: number, c: number, n: number, cls: string, dx: number) => {
      if (!n) return "";
      const [lo, hi] = wilson(c, n);
      return `<line x1="${x(k) + dx}" x2="${x(k) + dx}" y1="${y(lo)}" y2="${y(hi)}" class="ch-err"/><circle cx="${x(k) + dx}" cy="${y(c / n)}" r="5" class="${cls}"><title>${c}/${n} clear</title></circle>`;
    };
    const pts = rows.map((r) => this.s.sorted
      ? dot(r.dial, r.plus.clear, r.plus.total, "pt-plus", -4) + dot(r.dial, r.minus.clear, r.minus.total, "pt-minus", 4)
      : dot(r.dial, r.all.clear, r.all.total, "pt-all", 0)).join("");
    const ticks = Array.from({ length: steps }, (_, k) => `<text x="${x(k)}" y="${H - B + 15}" text-anchor="middle" class="ch-t">${k}</text>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Clear-line rate per dial after the eraser. Grey: all traced calls. Teal: plus group. Purple: minus group.">
      <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="ch-axis"/><line x1="${L}" x2="${L}" y1="${y(0)}" y2="${y(1)}" class="ch-axis"/>
      <line x1="${L}" x2="${W - R}" y1="${y(0.5)}" y2="${y(0.5)}" class="ch-grid"/>
      <text x="${L - 5}" y="${y(1) + 4}" text-anchor="end" class="ch-t">100%</text><text x="${L - 5}" y="${y(0) + 4}" text-anchor="end" class="ch-t">0%</text>
      ${this.s.sorted ? `<path d="${curve(0)}" class="ch-sister"/><path d="${curve(this.cfg.mimicPhaseDeg)}" class="ch-mimic"/>` : ""}
      ${pts}${ticks}<text x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle" class="ch-t">dial setting · y: how often the line came through clear</text></svg>
      <p class="legend">${this.s.sorted
        ? `<span class="lg-item"><span class="lg-pt pt-plus-l"></span> + group</span><span class="lg-item"><span class="lg-pt pt-minus-l"></span> − group</span><span class="lg-item"><span class="lg-sister"></span> Mira's + pattern</span><span class="lg-item"><span class="lg-mimic"></span> impostor's + pattern</span>`
        : `<span class="lg-item"><span class="lg-pt"></span> all traced calls (no pattern)</span>`}</p>`;
  }

  private loop = (ms: number): void => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    const t = ms / 1000, g = this.canvas.getContext("2d")!, W = this.canvas.width, H = this.canvas.height;
    const age = t - this.resultAt;
    if (this.s.result === "letIn" && this.resultAt > 0 && age > 0.9 && age < 2.6 && !this.gentle) {
      drawMimicFace(g, W, H, t, 1);
      return;
    }
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2; i++) {
      const x0 = i * (W / 2) + 3, w = W / 2 - 6, h = H - 6;
      g.save();
      g.beginPath();
      g.rect(x0, 3, w, h);
      g.clip();
      const d = drawPorch(g, x0, 3, w, h, t + i * 3.7, { lamp: this.calm ? 1 : 0.8 + 0.2 * Math.sin(t * 11 + i), open: "no", seed: 31 + i });
      const fade = this.s.result ? Math.max(0, 1 - age / 2) : 1;
      drawFigure(g, d.doorX + d.doorW / 2, d.doorY + d.doorH + 4, d.doorH * 0.9, t, fade, 0.2, this.calm);
      postProcess(g, x0, 3, w, h, t, { tint: "green", grain: !this.calm });
      g.fillStyle = "rgba(255,90,72,0.9)";
      g.font = "600 13px ui-monospace, Menlo, monospace";
      g.fillText(i ? "CAM 2 · SIDE DOOR · TRACED" : "CAM 1 · FRONT DOOR · TRACED", x0 + 10, 22);
      g.restore();
    }
  }

  dispose(): void {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }
}
