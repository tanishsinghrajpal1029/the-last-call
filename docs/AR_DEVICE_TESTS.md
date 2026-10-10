# AR device tests

**Status: no physical phone has been tested yet.** Nothing below claims that AR works on a phone
until the results table has real rows.

## What has been tested (desktop only)

| Test | Environment | Result | Evidence |
|---|---|---|---|
| Marker detection + pose maths on synthetic images (5 poses, 4 print rotations) | Node 22 | pass | `tests/core/marker.test.mjs` |
| Marker AR end-to-end with a synthetic fake camera: marker tracked, 3D house drawn over the video, Listen works from the overlay, 3 exit/enter cycles leave one view, no errors | Headless Chromium (Playwright), `--use-file-for-fake-video-capture` | pass | `tests/browser/marker_e2e.mjs`, `artifacts/marker_*fake_camera.png` |
| WebXR button disabled when `immersive-ar` is unsupported | Headless Chromium | pass | `tests/browser/smoke.mjs` |
| WebXR session, hit test, anchors, DOM overlay | none | **not tested** (no device or emulator) | none |

The marker and WebXR plumbing is adapted from the Dark Sweeper AR views written earlier in this
hackathon, which were also not yet device-tested. A code review pass fixed start/stop races
(exit while the session or camera is starting), a null hit-test pose and camera resume.

## Serving over trusted HTTPS

Camera and WebXR need a secure context; `http://<laptop-ip>:8080` is not one.

1. **GitHub Pages (recommended):** push the repository (public, MIT), enable
   *Settings → Pages → Source: GitHub Actions*. The workflow publishes `build/web` to
   `https://<user>.github.io/<repo>/`.
2. **LAN HTTPS with a locally trusted certificate** (e.g. mkcert with its root CA installed on the
   phone): `npm run build && node scripts/serve.mjs --https key.pem cert.pem`.
3. **Android over USB:** `chrome://inspect` → port forwarding of `localhost:8080`.

## Protocol (repeat per phone)

1. Open the HTTPS address. Note which AR buttons are enabled.
2. **Android:** *Play in AR on your table*; grant camera. **iPhone:** print `marker.html` at 100%
   (black square = 120 mm), lay it flat in even light, *Play in AR with the printed marker*.
3. Placement: WebXR — move until the ring appears, try Smaller/Larger, tap to place. Marker — point
   at the marker; the house should appear on the paper.
4. Walk half way around the table. Does the house stay on the table? Note drift.
5. Answer the first call. Tap Listen at dial 0 and dial 4; confirm the caption, the voice and the
   pulses from both doors; confirm a tap on the controls does not move or place the house.
6. Trace once; confirm the confirmation sheet, the red record pulse and only one door's figure.
7. Cover the camera or marker for 2 s; confirm the "lost" message and recovery.
8. Rotate portrait ↔ landscape; lock the screen and return (iPhone: camera must resume).
9. Play all four calls to the ending. Note smoothness (subjective).
10. *Move house* (WebXR) and re-place; exit and re-enter AR three times.
11. Turn voice and sound off and on in Settings; confirm captions carry everything.
12. Deny camera permission once: confirm a clear message and that screen mode still works.

## Results (fill in)

| Date | Phone | OS | Browser + version | Mode | Steps passed | Issues | Evidence |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

Until rows exist: "Designed for Chrome on ARCore Android (WebXR) and iPhone Safari via a printed
marker. Not yet verified on a physical device."
