/**
 * Markerless "look-around" AR for iPhone and iPad (and any phone): the rear camera feed
 * with the house drawn on top, held in place by the phone's motion sensors
 * (DeviceOrientation). This is rotation-only (3-DoF) tracking: turn and tilt
 * the phone and the house stays put in the room; walking around it does not
 * change your viewpoint. iPhone Safari has no WebXR, so true surface tracking
 * there needs the printed marker (marker mode).
 *
 * Device results: see docs/AR_DEVICE_TESTS.md.
 */

import { Controller } from "../controller.js";
import { Ui } from "../ui.js";
import { Renderer } from "./gl.js";
import { Mat4, multiply, perspective, rotationY, scaling, translation } from "./math.js";
import { HousePainter } from "./scene.js";

type OrientationPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Ask for motion-sensor access. On iOS this must run inside the tap handler,
 * before any other await. Resolves true when events may arrive.
 */
export async function requestMotionPermission(): Promise<boolean> {
  const DOE = (window as unknown as { DeviceOrientationEvent?: OrientationPermission }).DeviceOrientationEvent;
  if (!DOE) return false;
  if (typeof DOE.requestPermission === "function") {
    try {
      return (await DOE.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * The screen's rotation (0, 90, 180 or 270) used to turn sensor readings into the camera's
 * orientation. Browsers report it in different ways, and some iPads report an angle that doesn't
 * match how the page is actually shown (portrait page, landscape angle, or the reverse), which
 * turned the house sideways. So the reported angle is only trusted when it agrees with the page's
 * shape; otherwise portrait means 0, and landscape uses which side of the device points down
 * (gamma < 0: right edge up, angle 90; gamma > 0: angle 270).
 */
export function resolveScreenAngle(reported: number | undefined, legacy: number | undefined, width: number, height: number, gamma: number): number {
  const norm = (a: number) => ((Math.round(a / 90) * 90) % 360 + 360) % 360;
  const landscapePage = width > height;
  for (const a of [reported, legacy]) {
    if (typeof a !== "number" || !isFinite(a)) continue;
    const n = norm(a);
    if ((n === 90 || n === 270) === landscapePage) return n;
  }
  if (!landscapePage) return 0;
  return gamma < 0 ? 90 : 270;
}

const deg = Math.PI / 180;

/**
 * The screen rotation that keeps the picture upright, worked out from gravity. While the device is
 * held up (not flat), the screen's "down" is whichever device edge points at the floor. This is
 * what the system itself uses to rotate the page, and it doesn't depend on the browser reporting
 * the rotation correctly (an iPad drew the house on its side even with the reported angle fixed).
 * Returns null when the device is too close to flat to tell; keeps `prev` until another edge is
 * clearly lower (no flicker near 45°).
 */
export function gravityScreenAngle(beta: number, gamma: number, prev: number | null): number | null {
  const b = beta * deg, g = gamma * deg;
  const gx = Math.cos(b) * Math.sin(g), gy = -Math.sin(b); // gravity in the device's screen plane
  const mag = Math.hypot(gx, gy);
  if (mag < 0.5) return null;
  const down: Record<number, [number, number]> = { 0: [0, -1], 90: [-1, 0], 180: [0, 1], 270: [1, 0] };
  const along = (a: number) => (down[a]![0] * gx + down[a]![1] * gy) / mag;
  if (prev !== null && along(prev) > 0.6) return prev;
  return [0, 90, 180, 270].reduce((best, a) => (along(a) > along(best) ? a : best), 0);
}

/**
 * Where the house goes when the player aims the camera at the floor. Rotation-only tracking can't
 * see the floor, so it assumes the device is held `eye` metres above it (chest height) and puts the
 * house where the camera's line of sight meets that floor, 0.7 to 3 m away, sized to the distance.
 * Returns null when the camera points level or up (then the house floats ahead, as before).
 * `f` is the camera's forward direction in world space (y up).
 */
export function placeOnFloor(fx: number, fy: number, fz: number, eye = 1.2): { x: number; y: number; z: number; dist: number; width: number } | null {
  const h = Math.hypot(fx, fz);
  if (h < 1e-6 || fy > -0.17) return null; // less than ~10 degrees below the horizon
  const dist = Math.min(3, Math.max(0.7, (eye * h) / -fy));
  return { x: (fx / h) * dist, y: -eye, z: (fz / h) * dist, dist, width: Math.min(0.9, Math.max(0.35, 0.3 * dist)) };
}

/**
 * How much bigger to draw the house on a bigger screen. The picture covers the same view angle on
 * every device, so on an iPad the house looked small next to the iPad's size; a 390-point-wide
 * phone keeps 1×, and the factor grows with the screen's shorter side up to 1.8× (an 834-point iPad).
 */
export function screenSizeFactor(width: number, height: number): number {
  return Math.min(1.8, Math.max(1, Math.min(width, height) / 460));
}

export function gyroCapable(): boolean {
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && "DeviceOrientationEvent" in window;
}

/**
 * Camera-to-world rotation (column-major 4x4, GL world: x east, y up, z south)
 * from DeviceOrientation angles and the screen rotation. Exported for tests.
 */
export function cameraRotation(alpha: number, beta: number, gamma: number, screenAngle: number): Mat4 {
  const a = alpha * deg, b = beta * deg, g = gamma * deg, s = -screenAngle * deg;
  // device frame -> earth frame (x east, y north, z up): R = Rz(a) Rx(b) Ry(g)
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
  const R = [
    [ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg],
    [sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg],
    [-cb * sg, sb, cb * cg],
  ];
  // account for the screen being rotated relative to the device
  const cs = Math.cos(s), ss = Math.sin(s);
  const S = [[cs, -ss, 0], [ss, cs, 0], [0, 0, 1]];
  const M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => R[i]![0]! * S[0]![j]! + R[i]![1]! * S[1]![j]! + R[i]![2]! * S[2]![j]!));
  // earth (x east, y north, z up) -> GL world (x east, y up, z south)
  const W = [M[0]!, M[2]!, M[1]!.map((v) => -v)];
  const out = new Float32Array(16);
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) out[col * 4 + row] = W[row]![col]!;
  out[15] = 1;
  return out;
}

export class GyroView {
  private wrap: HTMLElement | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private renderer: Renderer | null = null;
  private painter: HousePainter | null = null;
  ui: Ui | null = null;
  private status: HTMLElement | null = null;
  private stream: MediaStream | null = null;
  private raf = 0;
  private stopped = false;
  private orient: { alpha: number; beta: number; gamma: number } | null = null;
  private board: Mat4 | null = null;
  private boardWidth = 0.5;
  private lastEvent = 0;
  private waitStart = 0;
  private placeBar: HTMLElement | null = null;
  /** size multiplier: starts from the screen size, then Smaller / Larger */
  private sizeScale = 1;
  private placeMsg: HTMLElement | null = null;
  /** where the house would go right now (while placing) */
  private aim: { board: Mat4; width: number; floor: boolean } | null = null;
  /** house width in metres and distance in front of the phone */
  width = 0.5;
  distance = 1.4;
  drop = 0.35;

  constructor(private c: Controller, private mountUi: (parent: HTMLElement) => Ui, private onExit: () => void) {}

  async start(container: HTMLElement): Promise<void> {
    if (!gyroCapable()) throw new Error("Look-around AR needs an HTTPS page, a camera and motion sensors.");
    this.wrap = document.createElement("div");
    this.wrap.className = "gyro-view";
    this.wrap.innerHTML = `<video playsinline muted autoplay aria-hidden="true"></video><canvas aria-label="Augmented reality view: the house and its two doors in your room"></canvas>
      <p class="xr-status" role="status" aria-live="polite"></p><div class="gyro-ui"></div>
      <div class="place-bar gyro-place-bar"><p class="gyro-place-msg">Aim at the floor until the yellow ring appears where the house should stand, then tap Place here.</p>
      <div class="place-buttons"><button type="button" class="btn btn-ghost" id="gyro-smaller">Smaller</button>
      <span id="gyro-size"></span><button type="button" class="btn btn-ghost" id="gyro-larger">Larger</button>
      <button type="button" class="btn btn-primary" id="gyro-place">Place here</button></div></div>`;
    container.appendChild(this.wrap);
    this.video = this.wrap.querySelector("video")!;
    this.canvas = this.wrap.querySelector("canvas")!;
    this.status = this.wrap.querySelector(".xr-status");
    this.placeBar = this.wrap.querySelector<HTMLElement>(".gyro-place-bar");
    this.placeMsg = this.wrap.querySelector<HTMLElement>(".gyro-place-msg");
    this.wrap.querySelector("#gyro-place")!.addEventListener("click", () => this.placeNow());
    this.sizeScale = screenSizeFactor(window.innerWidth, window.innerHeight);
    this.wrap.querySelector("#gyro-smaller")!.addEventListener("click", () => this.resize(1 / 1.2));
    this.wrap.querySelector("#gyro-larger")!.addEventListener("click", () => this.resize(1.2));
    this.resize(1);
    window.addEventListener("deviceorientation", this.onOrient);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    } catch (e) {
      this.cleanup();
      throw new Error("The camera could not be opened (" + (e instanceof Error ? e.name : "error") + "). Allow camera access or play on screen.");
    }
    if (this.stopped) {
      this.stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => undefined);
    if (this.stopped) {
      this.cleanup();
      return;
    }
    const glread = new URLSearchParams(location.search).has("glread");
    const gl = this.canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, antialias: true, preserveDrawingBuffer: glread });
    if (!gl) {
      this.cleanup();
      throw new Error("WebGL2 is not available on this device.");
    }
    this.gl = gl;
    this.renderer = new Renderer(gl);
    this.painter = new HousePainter(this.renderer);
    this.ui = this.mountUi(this.wrap.querySelector<HTMLElement>(".gyro-ui")!);
    this.ui.onExit = () => this.stop();
    this.ui.onReposition = () => { this.board = null; if (this.placeBar) this.placeBar.hidden = false; };
    this.setStatus("");
    document.addEventListener("visibilitychange", this.onVisibility);
    this.raf = requestAnimationFrame(this.loop);
  }

  private onOrient = (e: DeviceOrientationEvent): void => {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    this.orient = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
    this.lastEvent = performance.now();
  };

  private onVisibility = (): void => {
    if (!document.hidden && this.video && this.stream) void this.video.play().catch(() => undefined);
  };

  private setStatus(msg: string): void {
    if (!this.status) return;
    this.status.textContent = msg;
    this.status.hidden = !msg;
  }

  private angle: number | null = null;
  private readonly debug = new URLSearchParams(location.search).has("debug");

  private screenAngle(): number {
    const so = screen.orientation as ScreenOrientation | undefined;
    const wo = (window as unknown as { orientation?: number }).orientation;
    const fromGravity = this.orient ? gravityScreenAngle(this.orient.beta, this.orient.gamma, this.angle) : null;
    if (fromGravity !== null) this.angle = fromGravity;
    else if (this.angle === null) this.angle = resolveScreenAngle(so?.angle, wo, window.innerWidth, window.innerHeight, this.orient?.gamma ?? 0);
    if (this.debug && this.orient && this.status) {
      const o = this.orient;
      this.status.hidden = false;
      this.status.textContent = `α ${o.alpha.toFixed(0)} β ${o.beta.toFixed(0)} γ ${o.gamma.toFixed(0)} · screen.orientation ${so?.angle ?? "–"} · window.orientation ${wo ?? "–"} · page ${window.innerWidth}×${window.innerHeight} · using ${this.angle}°`;
    }
    return this.angle;
  }

  private loop = (): void => {
    if (this.stopped) return;
    this.raf = requestAnimationFrame(this.loop);
    const canvas = this.canvas!, gl = this.gl!;
    const w = Math.max(1, Math.round(canvas.clientWidth * Math.min(2, devicePixelRatio)));
    const h = Math.max(1, Math.round(canvas.clientHeight * Math.min(2, devicePixelRatio)));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.orient) {
      this.waitStart ||= performance.now();
      this.setStatus(performance.now() - this.waitStart > 2500
        ? "No motion sensors detected. This mode needs a phone; on a computer, exit and play on screen."
        : "Waiting for the motion sensors… (allow Motion & Orientation access)");
      return;
    }
    if (this.debug) { /* the status line shows the sensor readout */ }
    else if (performance.now() - this.lastEvent > 1500) this.setStatus("Motion sensors paused. Move the phone a little.");
    else this.setStatus("");
    const camRot = cameraRotation(this.orient.alpha, this.orient.beta, this.orient.gamma, this.screenAngle());
    if (!this.board) {
      // placing: show a yellow ring where the house would stand; the player taps Place here
      const fx = -camRot[8]!, fz = -camRot[10]!;
      const len = Math.hypot(fx, fz);
      this.aim = null;
      if (len >= 0.6) {
        const dx = fx / len, dz = fz / len, face = rotationY(Math.atan2(-dx, -dz));
        const floor = placeOnFloor(fx, -camRot[9]!, fz);
        this.aim = floor
          ? { board: multiply(translation(floor.x, floor.y, floor.z), face), width: floor.width * this.sizeScale, floor: true }
          : { board: multiply(translation(dx * this.distance, -this.drop, dz * this.distance), face), width: this.width * this.sizeScale, floor: false };
      }
      if (this.placeMsg) this.placeMsg.textContent = !this.aim
        ? "Hold the device up a little: it's pointing too far down or up."
        : this.aim.floor
          ? "The ring shows where the house will stand. Tap Place here."
          : "Tilt down toward the floor until the yellow ring appears, then tap Place here.";
    }
    // view = inverse(camera rotation) = transpose (camera at the origin)
    const view = new Float32Array(16);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) view[j * 4 + i] = camRot[i * 4 + j]!;
    view[15] = 1;
    const proj = perspective(60 * deg, w / h, 0.05, 30);
    this.renderer!.begin(multiply(proj, view));
    if (this.board) this.painter!.draw(this.board, this.c, this.boardWidth, performance.now() / 1000);
    else if (this.aim?.floor) {
      const r = this.renderer!;
      r.draw(r.ring, multiply(this.aim.board, scaling(this.aim.width * 0.6, 1, this.aim.width * 0.6)), [1, 0.8, 0.3, 0.9], 1);
    }
  };

  private resize(f: number): void {
    this.sizeScale = Math.min(3, Math.max(0.5, this.sizeScale * f));
    const l = this.wrap?.querySelector("#gyro-size");
    if (l) l.textContent = Math.round(this.sizeScale * 100) + "%";
  }

  /** Put the house where the ring is (or floating ahead if the device is held level). */
  placeNow(): void {
    if (!this.aim) return;
    this.board = this.aim.board;
    this.boardWidth = this.aim.width;
    if (this.placeBar) this.placeBar.hidden = true;
  }

  /** Test hook: the house's height relative to the device (−1.2 when standing on the assumed floor). */
  get boardY(): number | null {
    return this.board ? this.board[13]! : null;
  }

  /** Test hook. */
  get placed(): boolean {
    return !!this.board;
  }

  private cleanup(): void {
    window.removeEventListener("deviceorientation", this.onOrient);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.wrap?.remove();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.ui?.dispose();
    this.renderer?.dispose();
    this.cleanup();
    this.onExit();
  }
}
