/**
 * Procedural horror art (Canvas 2D), drawn in code: no image files.
 * The creature is an original design for this game: a small figure in Mira's
 * raincoat with its head at the wrong angle, and, if you let it in, her face
 * with black eyes and a jaw that keeps opening.
 *
 * Nothing drawn before the decision depends on who is really calling: both
 * door cameras always show the same hooded figure.
 */

export type G = CanvasRenderingContext2D;

/** Small deterministic noise so cracks and textures do not shimmer between frames. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A porch at night seen from a door camera, without the figure. */
export function drawPorch(g: G, x: number, y: number, w: number, h: number, t: number, opts: { lamp: number; open: "no" | "warm" | "black"; seed: number }): { doorX: number; doorY: number; doorW: number; doorH: number } {
  const rnd = prng(opts.seed);
  // wall with siding
  const wall = g.createLinearGradient(0, y, 0, y + h);
  wall.addColorStop(0, "#0a0f0f");
  wall.addColorStop(0.75, "#141b1a");
  wall.addColorStop(1, "#070909");
  g.fillStyle = wall;
  g.fillRect(x, y, w, h);
  g.strokeStyle = "rgba(255,255,255,0.035)";
  g.lineWidth = 1;
  for (let yy = y + 6; yy < y + h * 0.82; yy += 9) {
    g.beginPath();
    g.moveTo(x, yy);
    g.lineTo(x + w, yy + 1);
    g.stroke();
  }
  // door
  const doorW = w * 0.3, doorH = h * 0.66, doorX = x + w * 0.35, doorY = y + h * 0.15;
  g.fillStyle = "#050505";
  g.fillRect(doorX - 7, doorY - 7, doorW + 14, doorH + 7);
  if (opts.open === "no") {
    const dg = g.createLinearGradient(doorX, 0, doorX + doorW, 0);
    dg.addColorStop(0, "#1d150e");
    dg.addColorStop(1, "#2a1f15");
    g.fillStyle = dg;
    g.fillRect(doorX, doorY, doorW, doorH);
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.lineWidth = 2;
    for (const [px, py, pw, ph] of [[0.12, 0.06, 0.76, 0.36], [0.12, 0.5, 0.76, 0.42]] as const) g.strokeRect(doorX + doorW * px, doorY + doorH * py, doorW * pw, doorH * ph);
    g.fillStyle = "#6b5a3e";
    g.beginPath();
    g.arc(doorX + doorW * 0.85, doorY + doorH * 0.52, 2.5, 0, Math.PI * 2);
    g.fill();
  } else {
    const inner = g.createLinearGradient(0, doorY, 0, doorY + doorH);
    if (opts.open === "warm") {
      inner.addColorStop(0, "#f3c57a");
      inner.addColorStop(1, "#8a5a24");
    } else {
      inner.addColorStop(0, "#000");
      inner.addColorStop(1, "#050202");
    }
    g.fillStyle = inner;
    g.fillRect(doorX, doorY, doorW, doorH);
  }
  // porch floor with wet reflections
  const floorY = doorY + doorH;
  const fl = g.createLinearGradient(0, floorY, 0, y + h);
  fl.addColorStop(0, "#1b201f");
  fl.addColorStop(1, "#050606");
  g.fillStyle = fl;
  g.fillRect(x, floorY, w, y + h - floorY);
  // lamp cone
  if (opts.lamp > 0.02) {
    const lx = doorX + doorW / 2, ly = doorY - 16;
    const cone = g.createRadialGradient(lx, ly, 2, lx, ly + h * 0.35, h * 0.75);
    cone.addColorStop(0, `rgba(255,214,150,${0.42 * opts.lamp})`);
    cone.addColorStop(0.35, `rgba(255,190,120,${0.12 * opts.lamp})`);
    cone.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = cone;
    g.fillRect(x, y, w, h);
    g.fillStyle = `rgba(255,230,180,${0.9 * opts.lamp})`;
    g.beginPath();
    g.arc(lx, ly, 3.5, 0, Math.PI * 2);
    g.fill();
  }
  // rain
  g.strokeStyle = "rgba(200,220,230,0.16)";
  g.lineWidth = 1;
  for (let i = 0; i < 46; i++) {
    const rx = x + ((rnd() * w + t * 40 * (0.6 + rnd())) % w);
    const ry = y + ((rnd() * h + t * 520 * (0.7 + rnd() * 0.6)) % h);
    g.beginPath();
    g.moveTo(rx, ry);
    g.lineTo(rx - 2, ry + 12);
    g.stroke();
  }
  return { doorX, doorY, doorW, doorH };
}

/**
 * The little figure on the porch: a child in a raincoat, hood up, head hanging
 * at a wrong angle, arms too long, toes not quite touching the ground. It is
 * identical at both doors and for Mira and the mimic; dread rises with `near`
 * (calls used). `lookUp` (0..1) is only used after the decision, when the
 * mimic lifts its face to the camera.
 */
export function drawFigure(g: G, cx: number, footY: number, h: number, t: number, alpha: number, near = 0, still = false, lookUp = 0): void {
  if (alpha <= 0.01) return;
  const s = h * 0.62 * (1 + near * 1.1); // child height, growing as it comes closer
  // every few seconds the head snaps to the other side for a moment
  const snap = !still && Math.sin(t * 0.9) > 0.985 ? -1 : 1;
  const tilt = (still ? 0.38 : 0.36 + Math.sin(t * 0.21) * 0.06 + near * 0.35) * snap;
  const hover = still ? s * 0.012 : s * (0.012 + 0.006 * Math.sin(t * 0.7));
  g.save();
  g.globalAlpha = alpha;
  g.translate(cx, footY + near * s * 0.1);
  // a shadow that doesn't quite meet the feet
  const sh = g.createRadialGradient(0, 0, 1, 0, 0, s * 0.4);
  sh.addColorStop(0, "rgba(0,0,0,0.65)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sh;
  g.beginPath();
  g.ellipse(0, 0, s * 0.4, s * 0.07, 0, 0, Math.PI * 2);
  g.fill();
  g.translate(0, -hover);
  // boots
  g.fillStyle = "#0b0b0b";
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(side * s * 0.07, -s * 0.03, s * 0.055, s * 0.035, 0, 0, Math.PI * 2);
    g.fill();
  }
  // raincoat: small, A-line, wet sheen
  const coat = g.createLinearGradient(-s * 0.22, -s * 0.8, s * 0.22, 0);
  coat.addColorStop(0, "#3a3a2c");
  coat.addColorStop(0.45, "#5a5638");
  coat.addColorStop(1, "#24241a");
  g.fillStyle = coat;
  g.beginPath();
  g.moveTo(-s * 0.2, -s * 0.06);
  g.quadraticCurveTo(-s * 0.18, -s * 0.45, -s * 0.11, -s * 0.66);
  g.lineTo(s * 0.11, -s * 0.66);
  g.quadraticCurveTo(s * 0.18, -s * 0.45, s * 0.2, -s * 0.06);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(220,230,210,0.12)";
  g.lineWidth = Math.max(1, s * 0.01);
  g.beginPath();
  g.moveTo(-s * 0.08, -s * 0.6);
  g.quadraticCurveTo(-s * 0.13, -s * 0.35, -s * 0.15, -s * 0.1);
  g.stroke();
  // arms hanging straight down, far too long: grey fingers past the knees
  g.lineCap = "round";
  for (const side of [-1, 1]) {
    g.strokeStyle = "#2c2c22";
    g.lineWidth = s * 0.05;
    g.beginPath();
    g.moveTo(side * s * 0.12, -s * 0.62);
    g.quadraticCurveTo(side * s * 0.2, -s * 0.38, side * s * 0.19, -s * 0.16);
    g.stroke();
    g.strokeStyle = "rgba(200,198,185,0.75)";
    g.lineWidth = Math.max(1, s * 0.011);
    for (let f = 0; f < 4; f++) {
      g.beginPath();
      g.moveTo(side * s * (0.18 + f * 0.009), -s * 0.15);
      g.quadraticCurveTo(side * s * (0.19 + f * 0.01), -s * 0.09, side * s * (0.185 + f * 0.012), -s * (0.04 - f * 0.004));
      g.stroke();
    }
  }
  // the head: hood up, tilted too far
  g.save();
  g.translate(0, -s * 0.68);
  g.rotate(tilt - lookUp * 0.5 * Math.sign(tilt));
  const hood = g.createRadialGradient(-s * 0.03, -s * 0.12, s * 0.02, 0, -s * 0.1, s * 0.17);
  hood.addColorStop(0, "#5c5a3c");
  hood.addColorStop(1, "#22221a");
  g.fillStyle = hood;
  g.beginPath();
  g.ellipse(0, -s * 0.1, s * 0.13, s * 0.15, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#020202";
  g.beginPath();
  g.ellipse(0, -s * 0.08, s * 0.085, s * 0.105, 0, 0, Math.PI * 2);
  g.fill();
  const faceA = 0.35 + 0.5 * lookUp;
  const face = g.createRadialGradient(0, -s * 0.08, s * 0.01, 0, -s * 0.07, s * 0.09);
  face.addColorStop(0, `rgba(220,214,198,${faceA})`);
  face.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = face;
  g.beginPath();
  g.ellipse(0, -s * 0.07, s * 0.065, s * 0.085, 0, 0, Math.PI * 2);
  g.fill();
  // eyes: two black hollows; for a split second, a glint of light in them
  g.fillStyle = `rgba(0,0,0,${0.6 + 0.4 * lookUp})`;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(side * s * 0.026, -s * 0.095, s * (0.014 + 0.01 * lookUp), s * (0.018 + 0.014 * lookUp), 0, 0, Math.PI * 2);
    g.fill();
  }
  if (!still && Math.sin(t * 1.7) > 0.992) {
    g.fillStyle = "rgba(255,255,255,0.9)";
    for (const side of [-1, 1]) g.fillRect(side * s * 0.026 - 1, -s * 0.097, 2, 2);
  }
  if (lookUp > 0.3) {
    // the mouth opens: a thin dark line that keeps going
    g.fillStyle = "rgba(0,0,0,0.9)";
    g.beginPath();
    g.ellipse(0, -s * 0.035, s * 0.02, s * 0.03 * lookUp, 0, 0, Math.PI * 2);
    g.fill();
  }
  // wet hair hanging out of the hood, across the face
  g.strokeStyle = "rgba(3,3,3,0.95)";
  g.lineWidth = Math.max(1, s * 0.006);
  for (let k = -6; k <= 6; k++) {
    if (lookUp > 0.5 && Math.abs(k) < 3) continue;
    g.beginPath();
    g.moveTo(k * s * 0.011, -s * 0.18);
    g.quadraticCurveTo(k * s * 0.014, -s * 0.07, k * s * 0.015 + Math.sin(k * 1.7) * s * 0.008, s * (0.03 + 0.012 * Math.abs(k % 3)));
    g.stroke();
  }
  g.restore();
  g.restore();
}

/** Small wet handprints on the camera glass; more appear as calls are used (same at both doors). */
export function drawHandprints(g: G, x: number, y: number, w: number, h: number, count: number, seed: number): void {
  const rnd = prng(seed);
  g.save();
  for (let i = 0; i < count; i++) {
    const px = x + w * (0.12 + rnd() * 0.76), py = y + h * (0.15 + rnd() * 0.7), r = Math.min(w, h) * 0.035, rot = (rnd() - 0.5) * 0.8;
    g.save();
    g.translate(px, py);
    g.rotate(rot);
    g.fillStyle = "rgba(210,225,215,0.13)";
    g.strokeStyle = "rgba(230,240,235,0.18)";
    g.beginPath();
    g.ellipse(0, 0, r, r * 1.1, 0, 0, Math.PI * 2);
    g.fill();
    for (let f = 0; f < 5; f++) {
      const a = -Math.PI / 2 + (f - 2) * 0.38 + (f === 0 ? -0.5 : 0);
      g.beginPath();
      g.ellipse(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5, r * 0.22, r * 0.55, a + Math.PI / 2, 0, Math.PI * 2);
      g.fill();
    }
    // drips
    g.beginPath();
    g.moveTo(-r * 0.3, r);
    g.lineTo(-r * 0.3, r * (2 + rnd() * 2));
    g.stroke();
    g.restore();
  }
  g.restore();
}

/** A shape pressed right up against the lens for a split second (same at both doors). */
export function drawLensFlash(g: G, x: number, y: number, w: number, h: number, k: number): void {
  g.save();
  g.globalAlpha = Math.max(0, Math.min(1, k));
  g.fillStyle = "#050505";
  g.beginPath();
  g.ellipse(x + w * 0.5, y + h * 0.75, w * 0.48, h * 0.85, 0, 0, Math.PI * 2);
  g.fill();
  const face = g.createRadialGradient(x + w * 0.5, y + h * 0.55, 2, x + w * 0.5, y + h * 0.55, w * 0.28);
  face.addColorStop(0, "rgba(200,195,180,0.5)");
  face.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = face;
  g.fillRect(x, y, w, h);
  g.fillStyle = "#000";
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(x + w * (0.5 + side * 0.09), y + h * 0.5, w * 0.045, h * 0.07, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** Full-frame close-up of the mimic wearing Mira's small face, for the reveal (jump scare). */
export function drawMimicFace(g: G, w: number, h: number, t: number, intensity = 1): void {
  const rnd = prng(4242);
  g.save();
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  const shake = intensity > 0.5 ? (Math.random() - 0.5) * 10 * intensity : 0;
  g.translate(w / 2 + shake, h * 0.5 + shake * 0.5);
  g.rotate(0.22 + Math.sin(t * 2.3) * 0.02);
  const fw = h * 0.36, fh = h * 0.62;
  // yellow hood and soaked black hair
  g.fillStyle = "#3e3c26";
  g.beginPath();
  g.ellipse(0, -fh * 0.15, fw * 1.55, fh * 1.05, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#040404";
  g.beginPath();
  g.ellipse(0, -fh * 0.12, fw * 1.25, fh * 0.92, 0, 0, Math.PI * 2);
  g.fill();
  // a small round face, grey and wet
  const skin = g.createRadialGradient(-fw * 0.2, -fh * 0.3, fw * 0.05, 0, 0, fw * 1.2);
  skin.addColorStop(0, "#d2d0c4");
  skin.addColorStop(0.55, "#8e8c80");
  skin.addColorStop(1, "#191917");
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(0, -fh * 0.08, fw * 0.82, fh * 0.62, 0, 0, Math.PI * 2);
  g.fill();
  for (let k = 0; k < 120; k++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? "15,15,12" : "220,215,200"},${0.04 + rnd() * 0.06})`;
    g.beginPath();
    g.arc((rnd() - 0.5) * fw * 1.4, (rnd() - 0.6) * fh, rnd() * fw * 0.07, 0, Math.PI * 2);
    g.fill();
  }
  // eyes: completely black, too big, weeping black down the cheeks
  for (const side of [-1, 1]) {
    const ex = side * fw * 0.33, ey = -fh * 0.2;
    g.fillStyle = "#000";
    g.beginPath();
    g.ellipse(ex, ey, fw * 0.2, fw * (side < 0 ? 0.25 : 0.21), side * 0.12, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.85)";
    g.lineWidth = fw * 0.03;
    for (let d = 0; d < 3; d++) {
      g.beginPath();
      g.moveTo(ex + (d - 1) * fw * 0.06, ey + fw * 0.16);
      g.bezierCurveTo(ex + (d - 1) * fw * 0.08, ey + fh * 0.25, ex + (d - 1) * fw * 0.05, ey + fh * 0.35, ex + (d - 1.2) * fw * 0.07, ey + fh * (0.42 + d * 0.05));
      g.stroke();
    }
  }
  // the jaw hangs open far too long: a black gap reaching below the chin
  const open = fh * (0.55 + 0.05 * Math.sin(t * 16) * intensity);
  g.fillStyle = "#020000";
  g.beginPath();
  g.moveTo(-fw * 0.22, fh * 0.05);
  g.quadraticCurveTo(-fw * 0.3, fh * 0.05 + open * 0.6, -fw * 0.08, fh * 0.05 + open);
  g.lineTo(fw * 0.08, fh * 0.05 + open);
  g.quadraticCurveTo(fw * 0.3, fh * 0.05 + open * 0.6, fw * 0.22, fh * 0.05);
  g.quadraticCurveTo(0, -fh * 0.02, -fw * 0.22, fh * 0.05);
  g.fill();
  g.fillStyle = "rgba(225,220,200,0.92)";
  for (let k = -4; k <= 4; k++) {
    const tx = (k / 5) * fw * 0.2, tw = fw * 0.025, len = fh * (0.05 + rnd() * 0.04);
    g.beginPath();
    g.moveTo(tx - tw, fh * 0.06);
    g.lineTo(tx + tw, fh * 0.06);
    g.lineTo(tx, fh * 0.06 + len);
    g.closePath();
    g.fill();
  }
  // wet hair hanging in clumps over the edges of the face
  g.strokeStyle = "rgba(2,2,2,0.92)";
  for (let k = 0; k < 16; k++) {
    const side = k % 2 ? 1 : -1, off = 0.35 + rnd() * 0.75;
    g.lineWidth = Math.max(1.5, fw * (0.01 + rnd() * 0.035));
    const x0 = side * fw * off;
    g.beginPath();
    g.moveTo(x0 * 0.6, -fh * 0.82);
    g.bezierCurveTo(x0 * (0.7 + rnd() * 0.3), -fh * 0.35, x0 * (0.8 + rnd() * 0.4), fh * 0.1, x0 * (0.75 + rnd() * 0.5), fh * (0.45 + rnd() * 0.4));
    g.stroke();
  }
  g.restore();
  g.save();
  g.globalCompositeOperation = "multiply";
  g.fillStyle = "rgba(140,40,35,0.28)";
  g.fillRect(0, 0, w, h);
  g.restore();
  postProcess(g, 0, 0, w, h, t, { tint: "none", strength: intensity });
}

/** Night-vision CCTV treatment: tint, vignette, scanlines, grain. */
export function postProcess(g: G, x: number, y: number, w: number, h: number, t: number, opts: { tint?: "green" | "red" | "none"; strength?: number; grain?: boolean } = {}): void {
  const k = opts.strength ?? 1;
  g.save();
  if (opts.tint !== "none") {
    g.globalCompositeOperation = "color";
    g.fillStyle = opts.tint === "red" ? `rgba(140,10,10,${0.35 * k})` : "rgba(70,110,90,0.45)";
    g.fillRect(x, y, w, h);
    g.globalCompositeOperation = "source-over";
  }
  const v = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.25, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.85)");
  g.fillStyle = v;
  g.fillRect(x, y, w, h);
  g.fillStyle = "rgba(0,0,0,0.18)";
  for (let yy = y; yy < y + h; yy += 3) g.fillRect(x, yy, w, 1);
  if (opts.grain !== false) {
    for (let i = 0; i < (w * h) / 900; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.1})`;
      g.fillRect(x + Math.random() * w, y + Math.random() * h, 1.5, 1.5);
    }
  }
  g.restore();
}

/** Render the figure into an offscreen canvas (for the AR billboard texture). */
export function figureSprite(size = 256): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size * 2;
  const g = c.getContext("2d")!;
  drawFigure(g, size / 2, size * 2 - 6, size * 1.9 / 0.62, 0, 1, 0, true);
  return c;
}
