// Writes a Y4M video of the printed marker seen by a tilted camera, for
// Chromium's --use-file-for-fake-video-capture. Synthetic; not a real camera.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const M = await import(path.join(root, "build/js/apps/web/src/ar/markerMath.js"));
const W = 640, H = 480, f = 560, L = 0.12, tilt = 0.85, dist = 0.42;
// tabletop view: marker top (Z < 0) is far away, near edge (Z > 0) closer to the camera
const toCam = (X, Z) => [X, Z * Math.cos(tilt), dist - Z * Math.sin(tilt)];
const project = (X, Z) => { const [x, y, z] = toCam(X, Z); return [W / 2 + (f * x) / z, H / 2 + (f * y) / z]; };
const src = [[-L / 2, -L / 2], [L / 2, -L / 2], [L / 2, L / 2], [-L / 2, L / 2]];
const Hinv = M.homography(src.map(([X, Z]) => project(X, Z)), src);
const n = M.MARKER_CELLS;
const bit = (u, v) => { const j = Math.floor(u * n), i = Math.floor(v * n); return i === 0 || j === 0 || i === n - 1 || j === n - 1 ? 1 : M.MARKER_CODE[i - 1][j - 1]; };
const Y = Buffer.alloc(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const [X, Z] = M.applyH(Hinv, [x + 0.5, y + 0.5]);
  const u = X / L + 0.5, v = Z / L + 0.5;
  const inside = u >= 0 && u < 1 && v >= 0 && v < 1;
  const margin = u > -0.2 && u < 1.2 && v > -0.2 && v < 1.2; // white paper around the marker
  Y[y * W + x] = inside ? (bit(u, v) ? 25 : 230) : margin ? 230 : 120 + ((x * 7 + y * 13) % 30);
}
const UV = Buffer.alloc((W / 2) * (H / 2), 128);
const frames = [];
for (let k = 0; k < 30; k++) frames.push(Buffer.from("FRAME\n"), Y, UV, UV);
const out = process.argv[2] || path.join(root, "build", "fake_camera.y4m");
writeFileSync(out, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`), ...frames]));
console.log("wrote", out);
