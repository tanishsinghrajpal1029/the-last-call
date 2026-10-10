// Marker tracking maths on synthetic camera images with known pose.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const M = await import(path.join(root, "build/js/apps/web/src/ar/markerMath.js"));

const W = 320, H = 240;

function markerBit(u, v) {
  // u, v in [0,1) over the 6x6 marker
  const n = M.MARKER_CELLS;
  const j = Math.floor(u * n), i = Math.floor(v * n);
  if (i === 0 || j === 0 || i === n - 1 || j === n - 1) return 1;
  return M.MARKER_CODE[i - 1][j - 1];
}

/** Camera looking at the marker: board->camera(CV) rotation about x by tilt, then yaw. */
function makeScene({ tilt, yaw, dist, f, L, rot = 0 }) {
  // marker plane point (X, Z) -> CV camera coords
  const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
  const toCam = (X, Z) => {
    // rotate in plane by yaw (about board y), board y = up
    const x = cy * X + sy * Z, z = -sy * X + cy * Z, y = 0;
    // board frame -> camera: board x -> cam x; board z -> cam (0, ct, st)?; board y -> cam (0,-st,ct)
    const camX = x;
    const camY = z * ct - y * st;
    const camZ = z * st + y * ct + dist;
    return [camX, camY, camZ];
  };
  const project = (X, Z) => {
    const [x, y, z] = toCam(X, Z);
    return [W / 2 + (f * x) / z, H / 2 + (f * y) / z];
  };
  // render: inverse map each pixel to the plane by solving with homography
  const src = [[-L / 2, -L / 2], [L / 2, -L / 2], [L / 2, L / 2], [-L / 2, L / 2]];
  const dst = src.map(([X, Z]) => project(X, Z));
  const Hinv = M.homography(dst, src);
  const gray = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [X, Z] = M.applyH(Hinv, [x + 0.5, y + 0.5]);
    let u = X / L + 0.5, v = Z / L + 0.5;
    // rotate the printed marker on the table by rot quarter-turns
    for (let k = 0; k < rot; k++) [u, v] = [v, 1 - u];
    const inside = u >= 0 && u < 1 && v >= 0 && v < 1;
    gray[y * W + x] = inside ? (markerBit(u, v) ? 30 : 225) : 170;
  }
  return { gray, project, toCam };
}

function detect(gray, L) {
  const bin = M.adaptiveThreshold(gray, W, H, 12, 10);
  const { labels, blobs } = M.components(bin, W, H);
  const cands = blobs.filter((b) => b.count > 150).sort((a, b) => b.count - a.count);
  for (const b of cands) {
    const pts = [];
    for (let y = b.minY; y <= b.maxY; y++) for (let x = b.minX; x <= b.maxX; x++) if (labels[y * W + x] === b.label) pts.push([x + 0.5, y + 0.5]);
    const q = M.quadCorners(pts);
    if (!q) continue;
    const ordered = M.decodeMarker(q, (x, y) => (bin[Math.round(y - 0.5) * W + Math.round(x - 0.5)] ? 1 : 0));
    if (ordered) return ordered;
  }
  return null;
}

for (const sc of [
  { tilt: 0.9, yaw: 0.0, dist: 0.45, f: 260, L: 0.12, rot: 0 },
  { tilt: 1.0, yaw: 0.4, dist: 0.5, f: 300, L: 0.12, rot: 0 },
  { tilt: 0.7, yaw: -0.3, dist: 0.4, f: 250, L: 0.12, rot: 1 },
  { tilt: 0.8, yaw: 0.2, dist: 0.45, f: 280, L: 0.12, rot: 2 },
  { tilt: 0.95, yaw: 0.6, dist: 0.55, f: 320, L: 0.15, rot: 3 },
]) {
  test(`marker detected and pose recovered: ${JSON.stringify(sc)}`, () => {
    const { gray, project, toCam } = makeScene(sc);
    const corners = detect(gray, sc.L);
    assert.ok(corners, "marker not found");
    // corners are ordered TL, TR, BR, BL of the PRINTED marker; account for rotation
    const L = sc.L;
    let plane = [[-L / 2, -L / 2], [L / 2, -L / 2], [L / 2, L / 2], [-L / 2, L / 2]];
    // For a rotated print, the marker's own TL is a different table corner.
    for (let k = 0; k < sc.rot; k++) plane = [plane[1], plane[2], plane[3], plane[0]];
    for (let i = 0; i < 4; i++) {
      const p = project(...plane[i]);
      const d = Math.hypot(p[0] - corners[i][0], p[1] - corners[i][1]);
      assert.ok(d < 4, `corner ${i} off by ${d.toFixed(2)} px`);
    }
    // Pose in the marker's own frame (centred pixel coordinates)
    const markerPlane = [[-L / 2, -L / 2], [L / 2, -L / 2], [L / 2, L / 2], [-L / 2, L / 2]];
    const Hm = M.homography(markerPlane, corners.map(([x, y]) => [x - W / 2, y - H / 2]));
    const fEst = M.focalFromH(Hm);
    assert.ok(fEst && Math.abs(fEst - sc.f) / sc.f < 0.25, `focal ${fEst} vs ${sc.f}`);
    const pose = M.poseFromH(Hm, sc.f);
    assert.ok(pose);
    // marker centre must project to the image position of the true centre
    const t = [pose[12], pose[13], pose[14]];
    const c = toCam(0, 0);
    const trueGL = [c[0], -c[1], -c[2]];
    const err = Math.hypot(t[0] - trueGL[0], t[1] - trueGL[1], t[2] - trueGL[2]);
    assert.ok(err < 0.03, `translation error ${err.toFixed(4)} m`);
    // board y axis (normal) must point towards the camera: positive z in GL camera coords
    assert.ok(pose[6] > 0.3, "normal faces camera");
  });
}

test("blank image yields no marker", () => {
  const gray = new Uint8Array(W * H).fill(128);
  assert.equal(detect(gray, 0.12), null);
});

test("findMarker (production detector) agrees on a synthetic frame", () => {
  const sc = { tilt: 0.85, yaw: 0.35, dist: 0.5, f: 280, L: 0.12, rot: 1 };
  const { gray, project } = makeScene(sc);
  const corners = M.findMarker(gray, W, H);
  assert.ok(corners);
  const L = sc.L;
  let plane = [[-L / 2, -L / 2], [L / 2, -L / 2], [L / 2, L / 2], [-L / 2, L / 2]];
  plane = [plane[1], plane[2], plane[3], plane[0]];
  for (let i = 0; i < 4; i++) {
    const p = project(...plane[i]);
    assert.ok(Math.hypot(p[0] - corners[i][0], p[1] - corners[i][1]) < 4);
  }
});
