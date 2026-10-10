// Orientation maths for look-around AR (DeviceOrientation -> camera rotation).
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { cameraRotation } = await import(path.join(root, "build/js/apps/web/src/ar/gyro.js"));
const fwd = (m) => [-m[8], -m[9], -m[10]].map((v) => Math.round(v * 1e6) / 1e6 + 0);
const up = (m) => [m[4], m[5], m[6]].map((v) => Math.round(v * 1e6) / 1e6 + 0);

test("phone upright facing north looks north (-z) with up = +y", () => {
  const m = cameraRotation(0, 90, 0, 0);
  assert.deepEqual(fwd(m), [0, 0, -1]);
  assert.deepEqual(up(m), [0, 1, 0]);
});
test("turning left (alpha 90) looks west (-x)", () => {
  assert.deepEqual(fwd(cameraRotation(90, 90, 0, 0)), [-1, 0, 0]);
});
test("phone flat on its back (beta 0) looks at the floor", () => {
  assert.deepEqual(fwd(cameraRotation(0, 0, 0, 0)), [0, -1, 0]);
});
test("landscape (screen 90°) keeps the forward direction and makes the long edge horizontal", () => {
  const m = cameraRotation(0, 0, -90, 90); // phone held in landscape, camera facing north
  const f = fwd(m);
  assert.ok(Math.abs(f[1]) < 1e-6);
  assert.deepEqual(up(m), [0, 1, 0]);
});
test("rotation matrix is orthonormal", () => {
  const m = cameraRotation(37, 61, -12, 0);
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    let d = 0;
    for (let k = 0; k < 3; k++) d += m[a * 4 + k] * m[b * 4 + k];
    assert.ok(Math.abs(d - (a === b ? 1 : 0)) < 1e-6);
  }
});
