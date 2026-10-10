/**
 * Markerless "look-around" AR for iPhone (and any phone): the rear camera feed
 * with the house drawn on top, held in place by the phone's motion sensors
 * (DeviceOrientation). This is rotation-only (3-DoF) tracking: turn and tilt
 * the phone and the house stays put in the room; walking around it does not
 * change your viewpoint. iPhone Safari has no WebXR, so true surface tracking
 * there needs the printed marker (marker mode).
 *
 * Untested on a physical device at the time of writing: see docs/AR_DEVICE_TESTS.md.
 */

import { Controller } from "../controller.js";
import { Ui } from "../ui.js";
import { Renderer } from "./gl.js";
import { Mat4, multiply, perspective, rotationY, translation } from "./math.js";
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

export function gyroCapable(): boolean {
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && "DeviceOrientationEvent" in window;
}

const deg = Math.PI / 180;

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
  private lastEvent = 0;
  private waitStart = 0;
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
      <p class="xr-status" role="status" aria-live="polite"></p><div class="gyro-ui"></div>`;
    container.appendChild(this.wrap);
    this.video = this.wrap.querySelector("video")!;
    this.canvas = this.wrap.querySelector("canvas")!;
    this.status = this.wrap.querySelector(".xr-status");
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
    this.ui.onReposition = () => { this.board = null; };
    this.setStatus("Hold the phone up and look ahead. The house appears in front of you.");
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

  private screenAngle(): number {
    const so = screen.orientation as ScreenOrientation | undefined;
    if (so && typeof so.angle === "number") return so.angle;
    const wo = (window as unknown as { orientation?: number }).orientation;
    return typeof wo === "number" ? wo : 0;
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
    if (performance.now() - this.lastEvent > 1500) this.setStatus("Motion sensors paused. Move the phone a little.");
    else if (this.board) this.setStatus("");
    const camRot = cameraRotation(this.orient.alpha, this.orient.beta, this.orient.gamma, this.screenAngle());
    if (!this.board) {
      // place the house ahead of where the phone points, level, facing the player
      const fx = -camRot[8]!, fz = -camRot[10]!;
      const len = Math.hypot(fx, fz);
      if (len < 0.6) {
        this.setStatus("Hold the phone up and look ahead to place the house.");
        return; // pointing at the floor or ceiling: no reliable heading yet
      }
      const dx = fx / len, dz = fz / len;
      this.board = multiply(translation(dx * this.distance, -this.drop, dz * this.distance), rotationY(Math.atan2(-dx, -dz)));
    }
    // view = inverse(camera rotation) = transpose (camera at the origin)
    const view = new Float32Array(16);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) view[j * 4 + i] = camRot[i * 4 + j]!;
    view[15] = 1;
    const proj = perspective(60 * deg, w / h, 0.05, 30);
    this.renderer!.begin(multiply(proj, view));
    this.painter!.draw(this.board, this.c, this.width, performance.now() / 1000);
  };

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
