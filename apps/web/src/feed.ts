/**
 * 2D intercom feed: two night-vision door cameras drawn on a canvas.
 * Both panes show the same hooded figure (one call, two entrances). It creeps
 * closer as calls are used up, identically at both doors. A trace briefly shows
 * the figure at the traced door only. Nothing here depends on the hidden caller
 * or lean before the decision.
 */

import { drawFigure, drawHandprints, drawLensFlash, drawMimicFace, drawPorch, postProcess } from "./art.js";
import { Controller } from "./controller.js";
import { dialAngle, rad, simulate } from "../../../packages/core/src/physics.js";

const PANE_H = 340;

export class Feed {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private alive = true;
  private flashAt = -10;

  constructor(parent: HTMLElement, private c: Controller) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "feed";
    this.canvas.width = 760;
    this.canvas.height = 404;
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Intercom cameras: the front door and the side door. The same hooded figure stands at both.");
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop = (ms: number): void => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    this.draw(ms / 1000);
  };

  private draw(t: number): void {
    const g = this.ctx, W = this.canvas.width, H = PANE_H, FH = this.canvas.height;
    const v = this.c.visual, n = this.c.state.night;
    const calm = this.c.settings.reducedMotion;
    const since = t - v.lastCallAt;
    const traced = v.last && v.last.kind === "trace" && since < 3 ? v.last.door : null;
    const resultAge = t - v.resultAt;
    const used = n.budget ? (n.budget - n.callsLeft) / n.budget : 0;
    const near = 0.45 * used; // dread: it comes closer as the line runs out (same at both doors)
    if (!calm && Math.random() < 0.0016) this.flashAt = t;
    const flash = !calm && t - this.flashAt < 0.12 ? 1 : 0;

    // the reveal for the mimic when it is let in: the face, then nothing
    if (v.result === "letIn" && resultAge > 0.9) {
      if (resultAge < 2.6) drawMimicFace(g, W, FH, t, this.c.settings.gentle ? 0.3 : 1);
      else {
        g.fillStyle = "#000";
        g.fillRect(0, 0, W, FH);
        g.fillStyle = "rgba(230,60,50,0.9)";
        g.font = "600 18px ui-monospace, Menlo, monospace";
        g.fillText("SIGNAL LOST", W / 2 - 60, H / 2);
      }
      return;
    }

    g.fillStyle = "#000";
    g.fillRect(0, 0, W, FH);
    const pane = (i: number, label: string, door: "front" | "side") => {
      const x0 = i * (W / 2) + 3, w = W / 2 - 6, h = H - 6, y0 = 3;
      g.save();
      g.beginPath();
      g.rect(x0, y0, w, h);
      g.clip();
      const decided = n.decision === door && v.result && v.result !== "refused" && v.result !== "abandoned";
      const lamp = (calm ? 1 : 0.75 + 0.25 * Math.sin(t * 13 + i * 2) * Math.sin(t * 3.1)) * (Math.random() < 0.004 && !calm ? 0.1 : 1);
      const d = drawPorch(g, x0, y0, w, h, t + i * 3.7, { lamp, open: decided ? (v.result === "letIn" ? "black" : "warm") : "no", seed: 11 + i });
      let alpha = 1, lookUp = 0;
      if (traced) alpha = traced === door ? 1 : 0;
      if (v.result === "refused") {
        // the mimic, refused, slowly lifts its face to the camera (both doors), then is gone
        lookUp = Math.min(1, resultAge / 1.6);
        alpha = resultAge < 3.2 ? 1 : Math.max(0, 1 - (resultAge - 3.2));
      } else if (v.result) {
        const fade = Math.max(0, 1 - resultAge / 2.2);
        alpha = (n.decision === door || v.result === "abandoned" ? 1 : 0.8) * fade;
      }
      if (alpha > 0.01) drawFigure(g, d.doorX + d.doorW / 2, d.doorY + d.doorH + 4, d.doorH * 0.9, t + i * 0.05, alpha, v.result === "refused" ? near + lookUp * 0.5 : traced === door ? 0.15 : near, calm, lookUp);
      drawHandprints(g, x0, y0, w, h, n.budget - n.callsLeft, 900 + i * 17);
      if (traced && traced !== door) {
        g.fillStyle = "rgba(230,240,235,0.55)";
        g.font = "600 13px ui-monospace, Menlo, monospace";
        g.fillText("NO ONE THERE", x0 + w / 2 - 46, y0 + h * 0.9);
      }
      postProcess(g, x0, y0, w, h, t, { tint: "green", grain: !calm });
      if (flash) {
        g.fillStyle = "rgba(220,235,255,0.55)";
        g.fillRect(x0, y0, w, h);
      }
      // on static, for a split second something is pressed right up against the lens
      if (!calm && !this.c.settings.gentle && v.last && v.last.line === "static" && since > 0.25 && since < 0.4 && !traced && !v.result) {
        drawLensFlash(g, x0, y0, w, h, 1);
      }
      // static flash after a static outcome
      if (v.last && v.last.line === "static" && since < 0.9 && !traced) {
        g.fillStyle = `rgba(210,210,210,${0.35 * (1 - since / 0.9)})`;
        for (let yy = y0; yy < y0 + h; yy += 3) if (Math.random() < 0.55) g.fillRect(x0, yy, w, 1);
      }
      // overlay text
      g.fillStyle = "rgba(225,240,230,0.85)";
      g.font = "600 13px ui-monospace, Menlo, monospace";
      g.fillText(label, x0 + 10, y0 + 20);
      const clock = ["11:52", "00:20", "01:05", "03:33"][Math.min(3, this.c.state.index)];
      g.fillText(`${clock}:${String(Math.floor(t) % 60).padStart(2, "0")}`, x0 + 10, y0 + h - 10);
      if (Math.floor(t * 1.5) % 2 === 0) {
        g.fillStyle = "#e5483b";
        g.beginPath();
        g.arc(x0 + w - 44, y0 + 16, 4, 0, Math.PI * 2);
        g.fill();
        g.fillText("REC", x0 + w - 36, y0 + 20);
      }
      if (traced === door) {
        g.strokeStyle = "#ff5a48";
        g.lineWidth = 3;
        g.strokeRect(x0 + 3, y0 + 3, w - 6, h - 6);
        g.fillStyle = "#ff5a48";
        g.fillText("TRACED", x0 + w / 2 - 26, y0 + 20);
      }
      g.restore();
    };
    pane(0, "CAM 1 · FRONT DOOR", "front");
    pane(1, "CAM 2 · SIDE DOOR", "side");
    this.drawSignal(g, W, H, FH - H, t, traced ?? null, since);
  }

  /**
   * The quantum effect, made visible: the two halves of the call travel from the
   * doors to the handset. The dial delays the side half; in step they reinforce,
   * out of step they cancel. Shown for both hypotheses (Mira, and the impostor's
   * known offset), so it never reveals who is really calling. A trace records
   * the door: the halves can no longer interfere and both patterns go flat.
   */
  private drawSignal(g: CanvasRenderingContext2D, W: number, y0: number, h: number, t: number, traced: "front" | "side" | null, since: number): void {
    const c = this.c, f = c.nights, cfg = c.view().night, dial = c.state.night.dial;
    const calm = c.settings.reducedMotion;
    const phi = dialAngle(dial, f.dialSteps);
    const noise = c.sourceLabel.startsWith("the ideal model") ? null : f.noise;
    const pc = (theta: number) => simulate(rad(c.meterAlphaDeg()), rad(theta), phi, !!traced, noise)["clear"]!;
    const pM = pc(f.sisterPhaseDeg), pI = pc(cfg.mimicPhaseDeg);
    g.save();
    g.fillStyle = "#07090a";
    g.fillRect(0, y0, W, h);
    const mid = y0 + h / 2, cx = W / 2, amp = h * 0.28, k = 0.075, om = calm ? 0 : 5;
    const wave = (x0: number, x1: number, phase: number, col: string, dashed: boolean) => {
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.setLineDash(dashed ? [4, 5] : []);
      g.beginPath();
      const dir = Math.sign(x1 - x0);
      for (let x = x0; dir > 0 ? x <= x1 : x >= x1; x += 3 * dir) {
        const d = Math.abs(x - x0);
        const y = mid + amp * Math.sin(k * d - om * t + phase);
        if (x === x0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.setLineDash([]);
    };
    const front = "#d9a441", side = "#5fb3c9";
    // from each door to the handset; the side half is delayed by the dial
    wave(14, cx - 70, 0, front, traced === "side");
    wave(W - 14, cx + 70, -phi, side, traced === "front");
    g.font = "600 11px ui-monospace, Menlo, monospace";
    g.fillStyle = front;
    g.fillText("FRONT HALF →", 14, y0 + 12);
    g.fillStyle = side;
    g.textAlign = "right";
    g.fillText(`← SIDE HALF (delayed ${Math.round((phi * 180) / Math.PI)}°)`, W - 14, y0 + 12);
    g.textAlign = "start";
    // the handset: how often the line would come through clear here, for each caller
    const bx = cx - 62, bw = 124;
    g.fillStyle = "#121618";
    g.fillRect(bx, y0 + 4, bw, h - 8);
    const bar = (i: number, p: number, label: string, col: string) => {
      const x = bx + 10 + i * 58, top = y0 + 16, bh = h - 34;
      g.fillStyle = "#1e2427";
      g.fillRect(x, top, 46, bh);
      g.fillStyle = col;
      g.fillRect(x, top + bh * (1 - p), 46, bh * p);
      g.fillStyle = "#cfd8d4";
      g.font = "600 10px ui-monospace, Menlo, monospace";
      g.fillText(label, x, y0 + 13);
    };
    bar(0, pM, "IF MIRA", "#7ad38a");
    bar(1, pI, "IF IMP.", "#b98ad3");
    g.fillStyle = "#e9efec";
    g.font = "600 11px ui-monospace, Menlo, monospace";
    g.textAlign = "center";
    const verdict = traced ? "DOOR RECORDED: PATTERN GONE" : pM > 0.8 ? "IN STEP: ADDS UP" : pM < 0.2 ? "OUT OF STEP: CANCELS" : "PARTLY IN STEP";
    g.fillText(verdict, cx, y0 + h - 3);
    g.textAlign = "start";
    // after a call, the handset flashes with what was heard
    const last = c.visual.last;
    if (last && since < 1) {
      const a = 1 - since;
      g.fillStyle = last.line === "clear" ? `rgba(122,211,138,${0.45 * a})` : `rgba(230,230,230,${0.35 * a})`;
      if (last.line === "clear") g.fillRect(bx, y0 + 4, bw, h - 8);
      else for (let yy = y0 + 4; yy < y0 + h - 4; yy += 2) if (Math.random() < 0.5) g.fillRect(bx, yy, bw, 1);
    }
    if (traced) { // the record: a red dot on the traced door's half
      g.fillStyle = "#ff5a48";
      g.beginPath();
      g.arc(traced === "front" ? cx - 90 : cx + 90, mid, 6, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  dispose(): void {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.canvas.remove();
  }
}
