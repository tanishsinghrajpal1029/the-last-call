/**
 * The 3D intercom diorama for AR, in board-local metres (y up, the house at
 * the far side (-z), the intercom dial near the player (+z)). Shared by WebXR
 * and marker AR. Drawn only from public state and already-committed outcomes:
 * nothing here depends on the hidden caller or lean before the decision.
 * Light pulses are explanatory graphics, not a simulation.
 */

import { Controller } from "../controller.js";
import { Renderer, RGBA } from "./gl.js";
import { Mat4, multiply, rotationY, rotationZ, scaling, segmentMatrix, translation, Vec3 } from "./math.js";

const C = {
  ground: [0.07, 0.1, 0.1, 0.94] as RGBA,
  path: [0.2, 0.22, 0.22, 1] as RGBA,
  wall: [0.17, 0.2, 0.24, 1] as RGBA,
  roof: [0.1, 0.11, 0.13, 1] as RGBA,
  door: [0.32, 0.21, 0.12, 1] as RGBA,
  frame: [0.5, 0.42, 0.32, 1] as RGBA,
  warm: [1, 0.82, 0.5, 1] as RGBA,
  inside: [0.98, 0.8, 0.5, 1] as RGBA,
  void: [0, 0, 0, 1] as RGBA,
  figure: [0.03, 0.03, 0.04, 1] as RGBA,
  post: [0.35, 0.37, 0.38, 1] as RGBA,
  panel: [0.12, 0.14, 0.15, 1] as RGBA,
  tick: [0.55, 0.62, 0.6, 1] as RGBA,
  tickOn: [1, 0.75, 0.3, 1] as RGBA,
  front: [0.35, 0.85, 0.8, 1] as RGBA,
  side: [1, 0.72, 0.3, 1] as RGBA,
  clear: [1, 0.95, 0.8, 1] as RGBA,
  static: [0.6, 0.6, 0.62, 1] as RGBA,
  trace: [1, 0.35, 0.3, 1] as RGBA,
  rain: [0.7, 0.8, 0.9, 0.35] as RGBA,
  label: [0.85, 0.92, 0.9, 1] as RGBA,
};
const withA = (c: RGBA, a: number): RGBA => [c[0], c[1], c[2], c[3] * a];

const BASE_WIDTH = 0.34;

export class HousePainter {
  constructor(private r: Renderer) {}

  draw(board: Mat4, c: Controller, width: number, now: number): void {
    const r = this.r;
    const u = width / BASE_WIDTH;
    const root = multiply(board, scaling(u, u, u));
    const at = (m: Mat4) => multiply(root, m);
    const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, col: RGBA, em = 0) =>
      r.draw(r.box, at(multiply(translation(x, y, z), scaling(sx, sy, sz))), col, em);
    const sphere = (p: Vec3, d: number, col: RGBA, em = 0) => r.draw(r.sphere, at(multiply(translation(p[0], p[1], p[2]), scaling(d, d, d))), col, em);

    const v = c.visual, n = c.state.night;
    const since = now - v.lastCallAt;
    const traced = v.last && v.last.kind === "trace" && since < 3 ? v.last.door : null;
    const resAge = now - v.resultAt;
    const dark = v.result === "letIn" ? Math.min(1, Math.max(0, (resAge - 1) / 1)) : 0;
    const flick = c.settings.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(now * 11) * Math.sin(now * 2.7);

    // ground, path
    box(0, -0.003, 0, 0.34, 0.006, 0.27, C.ground);
    box(0, 0.0005, 0.03, 0.05, 0.002, 0.11, C.path);

    // house
    box(0, 0.085, -0.075, 0.3, 0.17, 0.09, C.wall);
    const roofL = multiply(translation(-0.075, 0.2, -0.075), multiply(rotationZ(0.42), scaling(0.17, 0.012, 0.1)));
    const roofR = multiply(translation(0.075, 0.2, -0.075), multiply(rotationZ(-0.42), scaling(0.17, 0.012, 0.1)));
    r.draw(r.box, at(roofL), C.roof);
    r.draw(r.box, at(roofR), C.roof);

    const doors: Array<["front" | "side", number]> = [["front", -0.075], ["side", 0.075]];
    for (const [door, x] of doors) {
      const chosen = n.decision === door && v.result && v.result !== "refused" && v.result !== "abandoned";
      // frame + interior + door slab (swings open if chosen)
      box(x, 0.044, -0.0295, 0.054, 0.088, 0.003, C.frame);
      box(x, 0.041, -0.0285, 0.046, 0.082, 0.002, chosen ? (v.result === "letIn" ? C.void : C.inside) : C.door, chosen && v.result !== "letIn" ? 0.9 : 0);
      if (chosen) {
        const swing = Math.min(1, Math.max(0, resAge / 0.8)) * 1.3;
        const hinge = multiply(translation(x - 0.023, 0.041, -0.027), rotationY(swing));
        r.draw(r.box, at(multiply(hinge, multiply(translation(0.023, 0, 0), scaling(0.046, 0.082, 0.004)))), C.door);
      }
      // lamp
      const lampOn = (1 - dark) * flick;
      sphere([x, 0.1, -0.026], 0.012, withA(C.warm, 0.3 + 0.7 * lampOn), lampOn);
      // label on the step
      r.drawLabel(door === "front" ? "F" : "S", at(multiply(translation(x, 0.002, 0.0), scaling(0.022, 1, 0.022))), C.label);
      // figure: equal at both doors (one call, two entrances); a trace shows it at the traced door only
      let a = 0.55;
      if (traced) a = traced === door ? 0.95 : 0;
      if (v.result) {
        const fade = Math.max(0, 1 - resAge / 2.5);
        a = (n.decision === door ? 0.9 : 0.55) * fade;
      }
      if (a > 0.01) {
        const sway = c.settings.reducedMotion ? 0 : Math.sin(now * 0.8 + x * 40) * 0.002;
        const fz = v.result === "letIn" && n.decision === door ? -0.012 - Math.min(0.02, resAge * 0.02) : -0.01;
        box(x + sway, 0.032, fz, 0.024, 0.05, 0.014, withA(C.figure, a));
        sphere([x + sway, 0.068, fz], 0.022, withA(C.figure, a));
      }
    }

    // intercom post and dial (near the player)
    box(0, 0.03, 0.09, 0.012, 0.06, 0.012, C.post);
    box(0, 0.07, 0.09, 0.05, 0.034, 0.012, C.panel);
    // panel lamp shows the last line
    if (v.last && since > 0.6 && since < 3.5) {
      const col = v.last.line === "clear" ? C.clear : C.static;
      const on = v.last.line === "clear" ? 1 : Math.random() < 0.5 ? 0.3 : 1;
      sphere([0, 0.072, 0.097], 0.014, withA(col, on), on);
    }
    const steps = c.nights.dialSteps;
    const dcx = 0, dcz = 0.17 - 0.06, R = 0.035;
    r.draw(r.ring, at(multiply(translation(dcx, 0.001, dcz), scaling(2 * R + 0.012, 1, 2 * R + 0.012))), C.panel);
    for (let k = 0; k < steps; k++) {
      const ang = (2 * Math.PI * k) / steps;
      const px = dcx + Math.sin(ang) * R, pz = dcz - Math.cos(ang) * R;
      box(px, 0.004, pz, 0.008, 0.008, 0.008, k === n.dial ? C.tickOn : C.tick, k === n.dial ? 0.8 : 0);
    }
    const pang = (2 * Math.PI * n.dial) / steps;
    r.draw(r.box, at(segmentMatrix([dcx, 0.004, dcz], [dcx + Math.sin(pang) * R * 0.8, 0.004, dcz - Math.cos(pang) * R * 0.8], 0.005)), C.tickOn, 0.6);

    // light pulses from the doors to the handset after a call
    if (v.last && since < 0.7 && !c.settings.reducedMotion) {
      const tt = since / 0.7;
      const end: Vec3 = [0, 0.07, 0.09];
      const show = (door: "front" | "side", x: number) => {
        const start: Vec3 = [x, 0.045, -0.02];
        for (let i = 0; i < 4; i++) {
          const s = Math.min(1, tt - i * 0.06);
          if (s <= 0) continue;
          const wob = door === "side" ? Math.sin(s * 12 + pang) * 0.008 : Math.sin(s * 12) * 0.008;
          const p: Vec3 = [start[0] + (end[0] - start[0]) * s, start[1] + (end[1] - start[1]) * s + wob, start[2] + (end[2] - start[2]) * s];
          sphere(p, 0.01, door === "front" ? C.front : C.side, 1);
        }
      };
      if (v.last.kind === "listen") { show("front", -0.075); show("side", 0.075); }
      else if (v.last.door) {
        show(v.last.door, v.last.door === "front" ? -0.075 : 0.075);
        sphere([0.03, 0.09, 0.09], 0.012, C.trace, 1); // the which-door record
      }
    }

    // rain
    if (!c.settings.reducedMotion) {
      for (let i = 0; i < 36; i++) {
        const fx = ((i * 0.6180339) % 1) - 0.5, fz = ((i * 0.4142135) % 1) - 0.5;
        const y = 0.3 - (((now * 0.5 + i * 0.137) % 1) * 0.3);
        box(fx * 0.34, y, fz * 0.27, 0.0015, 0.02, 0.0015, C.rain);
      }
    }
  }
}
