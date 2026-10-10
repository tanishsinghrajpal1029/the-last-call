/**
 * 2D intercom feed: two night-vision door cameras drawn on a canvas.
 * Both panes show the same hooded figure (one call, two entrances). It creeps
 * closer as calls are used up, identically at both doors. A trace briefly shows
 * the figure at the traced door only. Nothing here depends on the hidden caller
 * or lean before the decision.
 */

import { drawFigure, drawMimicFace, drawPorch, postProcess } from "./art.js";
import { Controller } from "./controller.js";

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
    this.canvas.height = 340;
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
    const g = this.ctx, W = this.canvas.width, H = this.canvas.height;
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
      if (resultAge < 2.6) drawMimicFace(g, W, H, t, this.c.settings.gentle ? 0.3 : 1);
      else {
        g.fillStyle = "#000";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "rgba(230,60,50,0.9)";
        g.font = "600 18px ui-monospace, Menlo, monospace";
        g.fillText("SIGNAL LOST", W / 2 - 60, H / 2);
      }
      return;
    }

    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    const pane = (i: number, label: string, door: "front" | "side") => {
      const x0 = i * (W / 2) + 3, w = W / 2 - 6, h = H - 6, y0 = 3;
      g.save();
      g.beginPath();
      g.rect(x0, y0, w, h);
      g.clip();
      const decided = n.decision === door && v.result && v.result !== "refused" && v.result !== "abandoned";
      const lamp = (calm ? 1 : 0.75 + 0.25 * Math.sin(t * 13 + i * 2) * Math.sin(t * 3.1)) * (Math.random() < 0.004 && !calm ? 0.1 : 1);
      const d = drawPorch(g, x0, y0, w, h, t + i * 3.7, { lamp, open: decided ? (v.result === "letIn" ? "black" : "warm") : "no", seed: 11 + i });
      let alpha = 1;
      if (traced) alpha = traced === door ? 1 : 0;
      if (v.result) {
        const fade = Math.max(0, 1 - resultAge / 2.2);
        alpha = (n.decision === door || v.result === "refused" || v.result === "abandoned" ? 1 : 0.8) * fade;
      }
      if (alpha > 0.01) drawFigure(g, d.doorX + d.doorW / 2, d.doorY + d.doorH + 4, d.doorH * 0.9, t + i * 0.05, alpha, traced === door ? 0.15 : near, calm);
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
  }

  dispose(): void {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.canvas.remove();
  }
}
