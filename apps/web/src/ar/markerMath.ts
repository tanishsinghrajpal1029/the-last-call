/**
 * Pure maths for printed-marker tracking (no DOM): thresholding, connected
 * components, quad fitting, homography, marker decoding and pose recovery.
 * Unit-tested in tests/game/marker.test.mjs with synthetic images.
 */

export type Pt = [number, number];

/** 6x6 marker: black outer ring; inner 4x4 code (1 = black), rotation-asymmetric. */
export const MARKER_CODE: number[][] = [
  [1, 1, 0, 0],
  [1, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 1, 0],
];
export const MARKER_CELLS = 6;

export function rotateCode(c: number[][]): number[][] {
  const n = c.length;
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => c[n - 1 - j]![i]!));
}

/** Adaptive threshold using an integral image. Returns 1 for "dark". */
export function adaptiveThreshold(gray: Uint8Array, w: number, h: number, radius: number, offset: number): Uint8Array {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x]!;
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)]! + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(w - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = integral[(y1 + 1) * (w + 1) + (x1 + 1)]! - integral[y0 * (w + 1) + (x1 + 1)]!
        - integral[(y1 + 1) * (w + 1) + x0]! + integral[y0 * (w + 1) + x0]!;
      out[y * w + x] = gray[y * w + x]! < sum / area - offset ? 1 : 0;
    }
  }
  return out;
}

export interface Blob {
  label: number;
  count: number;
  minX: number; minY: number; maxX: number; maxY: number;
}

/** 4-connected components of value-1 pixels. */
export function components(bin: Uint8Array, w: number, h: number): { labels: Int32Array; blobs: Blob[] } {
  const labels = new Int32Array(w * h).fill(-1);
  const blobs: Blob[] = [];
  const stack = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!bin[i] || labels[i] !== -1) continue;
    const label = blobs.length;
    const b: Blob = { label, count: 0, minX: w, minY: h, maxX: 0, maxY: 0 };
    let sp = 0;
    stack[sp++] = i;
    labels[i] = label;
    while (sp > 0) {
      const p = stack[--sp]!;
      const x = p % w, y = (p - x) / w;
      b.count++;
      if (x < b.minX) b.minX = x;
      if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y;
      if (y > b.maxY) b.maxY = y;
      const push = (q: number) => {
        if (bin[q] && labels[q] === -1) {
          labels[q] = label;
          stack[sp++] = q;
        }
      };
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }
    blobs.push(b);
  }
  return { labels, blobs };
}

/** Four corners of a roughly convex quad blob, in no particular order. */
export function quadCorners(points: Pt[]): Pt[] | null {
  if (points.length < 20) return null;
  let cx = 0, cy = 0;
  for (const p of points) { cx += p[0]; cy += p[1]; }
  cx /= points.length; cy /= points.length;
  const far = (from: Pt) => {
    let best = points[0]!, bd = -1;
    for (const p of points) {
      const d = (p[0] - from[0]) ** 2 + (p[1] - from[1]) ** 2;
      if (d > bd) { bd = d; best = p; }
    }
    return best;
  };
  const a = far([cx, cy]);
  const c = far(a);
  let b: Pt | null = null, d: Pt | null = null, bmax = 0, dmin = 0;
  for (const p of points) {
    const s = (c[0] - a[0]) * (p[1] - a[1]) - (c[1] - a[1]) * (p[0] - a[0]);
    if (s > bmax) { bmax = s; b = p; }
    if (s < dmin) { dmin = s; d = p; }
  }
  if (!b || !d) return null;
  return [a, b, c, d];
}

/** Solve 8x8 linear system (Gaussian elimination with pivoting). */
function solve(A: number[][], y: number[]): number[] | null {
  const n = y.length;
  const M = A.map((row, i) => [...row, y[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    if (Math.abs(M[piv]![col]!) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / M[col]![col]!;
      for (let k = col; k <= n; k++) M[r]![k]! -= f * M[col]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** Homography (row-major 3x3, h33 = 1) mapping src[i] -> dst[i]. */
export function homography(src: Pt[], dst: Pt[]): number[] | null {
  const A: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, yy] = src[i]!;
    const [u, v] = dst[i]!;
    A.push([x, yy, 1, 0, 0, 0, -u * x, -u * yy]);
    y.push(u);
    A.push([0, 0, 0, x, yy, 1, -v * x, -v * yy]);
    y.push(v);
  }
  const h = solve(A, y);
  return h ? [...h, 1] : null;
}

export function applyH(H: number[], p: Pt): Pt {
  const w = H[6]! * p[0] + H[7]! * p[1] + H[8]!;
  return [(H[0]! * p[0] + H[1]! * p[1] + H[2]!) / w, (H[3]! * p[0] + H[4]! * p[1] + H[5]!) / w];
}

/**
 * Decode a candidate quad. corners are image points in any cyclic order.
 * sample(x, y) returns 1 for dark. Returns corners ordered as the marker's
 * (top-left, top-right, bottom-right, bottom-left) or null.
 */
export function decodeMarker(corners: Pt[], sample: (x: number, y: number) => number): Pt[] | null {
  // enforce a consistent winding (clockwise in image coords, y down)
  const area = corners.reduce((s, p, i) => {
    const q = corners[(i + 1) % 4]!;
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0);
  const quad = area < 0 ? [corners[0]!, corners[3]!, corners[2]!, corners[1]!] : corners.slice();
  const unit: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const H = homography(unit, quad);
  if (!H) return null;
  const n = MARKER_CELLS;
  const cell = (i: number, j: number) => {
    // majority of 5 sample points inside the cell
    let s = 0;
    for (const [dx, dy] of [[0.5, 0.5], [0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]] as const) {
      const p = applyH(H, [(j + dx) / n, (i + dy) / n]);
      s += sample(p[0], p[1]);
    }
    return s >= 3 ? 1 : 0;
  };
  let borderDark = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === 0 || j === 0 || i === n - 1 || j === n - 1) borderDark += cell(i, j);
  }
  if (borderDark < 4 * (n - 1) - 2) return null;
  const inner = Array.from({ length: n - 2 }, (_, i) => Array.from({ length: n - 2 }, (_, j) => cell(i + 1, j + 1)));
  let code = MARKER_CODE;
  for (let rot = 0; rot < 4; rot++) {
    let mismatches = 0;
    for (let i = 0; i < n - 2; i++) for (let j = 0; j < n - 2; j++) if (inner[i]![j] !== code[i]![j]) mismatches++;
    if (mismatches <= 1) {
      // code rotated `rot` times clockwise matches: the marker's top-left is quad[rot']
      const order = [0, 1, 2, 3].map((k) => quad[(k + rot) % 4]!);
      return order;
    }
    code = rotateCode(code);
  }
  return null;
}

/** Focal length estimate from a plane homography (principal point at origin). */
export function focalFromH(H: number[]): number | null {
  const h11 = H[0]!, h12 = H[1]!, h21 = H[3]!, h22 = H[4]!, h31 = H[6]!, h32 = H[7]!;
  const cands: number[] = [];
  const d1 = h31 * h32;
  if (Math.abs(d1) > 1e-12) cands.push(-(h11 * h12 + h21 * h22) / d1);
  const d2 = h31 * h31 - h32 * h32;
  if (Math.abs(d2) > 1e-12) cands.push(-(h11 * h11 + h21 * h21 - h12 * h12 - h22 * h22) / d2);
  const good = cands.filter((f2) => f2 > 0 && Number.isFinite(f2));
  if (!good.length) return null;
  return Math.sqrt(good.reduce((a, b) => a + b, 0) / good.length);
}

/**
 * Pose of the marker plane. H maps marker-plane metres (X, Z) to centred
 * pixel coordinates (x right, y down, origin at the principal point).
 * Returns a column-major 4x4 model matrix board->camera in OpenGL camera
 * convention (x right, y up, -z forward); board y is the marker normal
 * pointing towards the camera.
 */
export function poseFromH(H: number[], f: number): Float32Array | null {
  // M = K^-1 H, with K = diag(f, f, 1)
  const m1 = [H[0]! / f, H[3]! / f, H[6]!];
  const m2 = [H[1]! / f, H[4]! / f, H[7]!];
  const m3 = [H[2]! / f, H[5]! / f, H[8]!];
  const n1 = Math.hypot(m1[0]!, m1[1]!, m1[2]!), n2 = Math.hypot(m2[0]!, m2[1]!, m2[2]!);
  if (n1 < 1e-12 || n2 < 1e-12) return null;
  let lam = 2 / (n1 + n2);
  if (m3[2]! * lam < 0) lam = -lam; // marker must be in front (z > 0 in CV coords)
  let rx = m1.map((v) => v * lam);
  let rz = m2.map((v) => v * lam);
  const t = m3.map((v) => v * lam);
  // orthonormalise (symmetric Gram-Schmidt)
  const norm = (v: number[]) => { const l = Math.hypot(v[0]!, v[1]!, v[2]!); return v.map((x) => x / l); };
  rx = norm(rx); rz = norm(rz);
  const bis = norm([rx[0]! + rz[0]!, rx[1]! + rz[1]!, rx[2]! + rz[2]!]);
  const perp = norm(cross(cross(rx, rz), bis));
  // perp points from rx towards rz, so rx = bis - perp and rz = bis + perp
  rx = norm([bis[0]! - perp[0]!, bis[1]! - perp[1]!, bis[2]! - perp[2]!]);
  rz = norm([bis[0]! + perp[0]!, bis[1]! + perp[1]!, bis[2]! + perp[2]!]);
  // right-handed board frame: y = z x x
  const ry = cross(rz, rx);
  // CV camera -> GL camera: flip y and z
  const g = (v: number[]) => [v[0]!, -v[1]!, -v[2]!];
  const X = g(rx), Y = g(ry), Z = g(rz), T = g(t);
  const out = new Float32Array(16);
  out.set([X[0]!, X[1]!, X[2]!, 0, Y[0]!, Y[1]!, Y[2]!, 0, Z[0]!, Z[1]!, Z[2]!, 0, T[0]!, T[1]!, T[2]!, 1]);
  return out;
}

function cross(a: number[], b: number[]): number[] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}

/** Full detector: grayscale image -> ordered marker corners (TL, TR, BR, BL) or null. */
export function findMarker(gray: Uint8Array, w: number, h: number): Pt[] | null {
  const bin = adaptiveThreshold(gray, w, h, Math.max(6, Math.round(w / 26)), 10);
  const { labels, blobs } = components(bin, w, h);
  const minCount = w * h * 0.0015;
  const cands = blobs
    .filter((b) => {
      const bw = b.maxX - b.minX + 1, bh = b.maxY - b.minY + 1;
      const fill = b.count / (bw * bh);
      return b.count >= minCount && bw >= 12 && bh >= 12 && bw / bh < 6 && bh / bw < 6 && fill > 0.12 && fill < 0.85
        && b.minX > 0 && b.minY > 0 && b.maxX < w - 1 && b.maxY < h - 1;
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const sample = (x: number, y: number) => {
    const xi = Math.round(x - 0.5), yi = Math.round(y - 0.5);
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) return 0;
    return bin[yi * w + xi]!;
  };
  for (const b of cands) {
    const pts: Pt[] = [];
    for (let y = b.minY; y <= b.maxY; y++) {
      for (let x = b.minX; x <= b.maxX; x++) {
        const i = y * w + x;
        if (labels[i] !== b.label) continue;
        // boundary pixels only
        if (labels[i - 1] !== b.label || labels[i + 1] !== b.label || labels[i - w] !== b.label || labels[i + w] !== b.label) {
          pts.push([x + 0.5, y + 0.5]);
        }
      }
    }
    const q = quadCorners(pts);
    if (!q) continue;
    const ordered = decodeMarker(q, sample);
    if (ordered) return ordered;
  }
  return null;
}
