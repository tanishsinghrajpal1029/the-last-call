// Orientation maths for look-around AR (DeviceOrientation -> camera rotation).
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { cameraRotation, resolveScreenAngle, gravityScreenAngle, placeOnFloor } = await import(path.join(root, "build/js/apps/web/src/ar/gyro.js"));
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

test("screen angle: trusted only when it matches the page's shape (iPad reported a landscape angle on a portrait page)", () => {
  assert.equal(resolveScreenAngle(0, undefined, 800, 1100, 0), 0);           // portrait, agrees
  assert.equal(resolveScreenAngle(90, undefined, 1100, 800, -90), 90);       // landscape, agrees
  assert.equal(resolveScreenAngle(270, undefined, 1100, 800, 90), 270);
  assert.equal(resolveScreenAngle(90, undefined, 800, 1100, 0), 0);          // portrait page, landscape angle: portrait wins
  assert.equal(resolveScreenAngle(90, 0, 800, 1100, 0), 0);                  // legacy value agrees with the page
  assert.equal(resolveScreenAngle(0, undefined, 1100, 800, -85), 90);        // landscape page, portrait angle: use gravity
  assert.equal(resolveScreenAngle(0, undefined, 1100, 800, 85), 270);
  assert.equal(resolveScreenAngle(undefined, -90, 1100, 800, 85), 270);      // iOS window.orientation -90 = 270
  assert.equal(resolveScreenAngle(undefined, undefined, 390, 844, 0), 0);
});

test("screen angle from gravity: the edge pointing at the floor is the bottom", () => {
  assert.equal(gravityScreenAngle(90, 0, null), 0);        // upright portrait
  assert.equal(gravityScreenAngle(70, 10, null), 0);       // tilted back a bit
  assert.equal(gravityScreenAngle(0, -90, null), 90);      // landscape, right edge up (as in the landscape test above)
  assert.equal(gravityScreenAngle(0, 90, null), 270);
  assert.equal(gravityScreenAngle(-90, 0, null), 180);     // upside down
  assert.equal(gravityScreenAngle(5, 5, null), null);      // flat on a table: can't tell
  assert.equal(gravityScreenAngle(45, -50, 0), 0);         // near 45°: keep the previous angle
  assert.equal(gravityScreenAngle(20, -80, 0), 90);        // clearly landscape now: switch
});

test("gravity angle keeps the house upright: camera's up vector points up when held upright", () => {
  for (const [b, g] of [[90, 0], [0, -90], [0, 90], [80, 5], [10, -75]]) {
    const a = gravityScreenAngle(b, g, null);
    const m = cameraRotation(30, b, g, a);
    assert.ok(m[5] > 0.5, `camera up has positive world-y for beta ${b} gamma ${g} (angle ${a}): ${m[5]}`);
  }
});

test("look-around placement: aiming at the floor stands the house on it", () => {
  const down = (deg) => [0, -Math.sin(deg * Math.PI / 180), -Math.cos(deg * Math.PI / 180)]; // facing -z
  const p = placeOnFloor(...down(40));
  assert.ok(p && Math.abs(p.y + 1.2) < 1e-9, "on the floor 1.2 m below the device");
  assert.ok(Math.abs(p.dist - 1.2 / Math.tan(40 * Math.PI / 180)) < 1e-9 && p.z < 0 && Math.abs(p.x) < 1e-9);
  assert.equal(placeOnFloor(...down(3)), null);            // aimed level: float ahead instead
  assert.equal(placeOnFloor(0, 0.3, -0.95), null);         // aimed up
  assert.equal(placeOnFloor(...down(15)).dist, 3);          // far away: clamped
  assert.ok(placeOnFloor(...down(15)).width <= 0.9);
});
