/**
 * 2D intercom feed: two grainy door-camera panes drawn on a canvas.
 * Both panes show the same figure (one call, two entrances). A trace briefly
 * shows the figure at the traced door only. Nothing drawn here depends on the
 * hidden lean or identity before the decision.
 */

import { Controller } from "./controller.js";

export class Feed {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private alive = true;

  constructor(parent: HTMLElement, private c: Controller) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "feed";
    this.canvas.width = 640;
    this.canvas.height = 300;
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Intercom cameras: the front door and the side door. The same figure stands at both.");
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
    const v = this.c.visual;
    const since = t - v.lastCallAt;
    const traced = v.last && v.last.kind === "trace" && since < 3 ? v.last.door : null;
    const resultAge = t - v.resultAt;
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    const pane = (i: number, label: string, door: "front" | "side") => {
      const x0 = i * (W / 2) + 4, w = W / 2 - 8, h = H - 8, y0 = 4;
      g.save();
      g.beginPath();
      g.rect(x0, y0, w, h);
      g.clip();
      // night porch
      const grd = g.createLinearGradient(0, y0, 0, y0 + h);
      grd.addColorStop(0, "#0d1416");
      grd.addColorStop(1, "#1a2224");
      g.fillStyle = grd;
      g.fillRect(x0, y0, w, h);
      // door
      const dx = x0 + w * 0.36, dw = w * 0.28, dy = y0 + h * 0.18, dh = h * 0.66;
      const open = v.result && (v.result === "saved" || v.result === "letIn" || v.result === "wrongDoor") && this.c.state.night.decision === door;
      g.fillStyle = open ? (v.result === "letIn" ? "#000" : "#e8c27a") : "#2a2016";
      g.fillRect(dx, dy, dw, dh);
      g.strokeStyle = "#4a3b2a";
      g.lineWidth = 3;
      g.strokeRect(dx, dy, dw, dh);
      // porch lamp
      const flicker = this.c.settings.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 13 + i * 2) * Math.sin(t * 3.1);
      const lamp = g.createRadialGradient(dx + dw / 2, dy - 10, 2, dx + dw / 2, dy - 10, w * 0.45);
      lamp.addColorStop(0, `rgba(255,214,140,${0.35 * flicker})`);
      lamp.addColorStop(1, "rgba(255,214,140,0)");
      g.fillStyle = lamp;
      g.fillRect(x0, y0, w, h);
      // figure (same at both doors unless this call was traced)
      let alpha = 0.55;
      if (traced) alpha = traced === door ? 0.95 : 0.0;
      if (v.result) {
        const fade = Math.max(0, 1 - resultAge / 2.5);
        alpha = v.result === "letIn" ? 0.55 * fade : v.result === "refused" ? 0.55 * fade : this.c.state.night.decision === door ? 0.9 * fade : 0.55 * fade;
      }
      if (alpha > 0.01) {
        const fx = dx + dw / 2 + (traced === door ? 0 : Math.sin(t * 0.7 + i) * 2);
        const fy = dy + dh * 0.98;
        g.fillStyle = `rgba(12,12,14,${alpha})`;
        g.beginPath();
        g.ellipse(fx, fy - dh * 0.78, dw * 0.16, dw * 0.19, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(fx - dw * 0.3, fy);
        g.quadraticCurveTo(fx - dw * 0.32, fy - dh * 0.6, fx, fy - dh * 0.64);
        g.quadraticCurveTo(fx + dw * 0.32, fy - dh * 0.6, fx + dw * 0.3, fy);
        g.closePath();
        g.fill();
      }
      // grain
      if (!this.c.settings.reducedMotion) {
        for (let k = 0; k < 220; k++) {
          const a = Math.random() * 0.12;
          g.fillStyle = `rgba(255,255,255,${a})`;
          g.fillRect(x0 + Math.random() * w, y0 + Math.random() * h, 1.5, 1.5);
        }
      }
      // static flash after a static outcome
      if (v.last && v.last.line === "static" && since < 0.9 && !traced) {
        g.fillStyle = `rgba(200,200,200,${0.25 * (1 - since / 0.9)})`;
        for (let yy = y0; yy < y0 + h; yy += 3) if (Math.random() < 0.5) g.fillRect(x0, yy, w, 1);
      }
      if (v.result === "letIn" && resultAge > 1.2) {
        g.fillStyle = `rgba(0,0,0,${Math.min(1, (resultAge - 1.2) / 0.8)})`;
        g.fillRect(x0, y0, w, h);
      }
      // overlay text
      g.fillStyle = "rgba(230,240,235,0.85)";
      g.font = "600 14px ui-monospace, Menlo, monospace";
      g.fillText(label, x0 + 10, y0 + 22);
      if (traced === door) {
        g.strokeStyle = "#ff6b5a";
        g.lineWidth = 3;
        g.strokeRect(x0 + 3, y0 + 3, w - 6, h - 6);
        g.fillStyle = "#ff6b5a";
        g.fillText("TRACED", x0 + w - 74, y0 + 22);
      } else if (traced) {
        g.fillStyle = "rgba(230,240,235,0.6)";
        g.fillText("NO ONE", x0 + w - 70, y0 + 22);
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
