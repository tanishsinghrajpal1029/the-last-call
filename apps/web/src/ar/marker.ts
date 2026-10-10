/**
 * Printed-marker tracked AR: rear camera via getUserMedia, marker detection and
 * pose estimation every frame (markerMath.ts), the house rendered in 3D on top
 * of the live video, anchored to the paper. Intended for iPhone Safari (no
 * WebXR AR) and as a fallback elsewhere. Requires HTTPS and camera permission.
 *
 * Adapted from the Dark Sweeper marker view (same author, this hackathon).
 * Untested on a physical device at the time of writing: see docs/AR_DEVICE_TESTS.md.
 */

import { Controller } from "../controller.js";
import { Ui } from "../ui.js";
import { Renderer } from "./gl.js";
import { findMarker, focalFromH, homography, poseFromH, Pt } from "./markerMath.js";
import { multiply, perspective, Vec3 } from "./math.js";
import { HousePainter } from "./scene.js";

const PROC_WIDTH = 320;

export class MarkerView {
  private wrap: HTMLElement | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private renderer: Renderer | null = null;
  private painter: HousePainter | null = null;
  ui: Ui | null = null;
  private status: HTMLElement | null = null;
  private stream: MediaStream | null = null;
  private proc: HTMLCanvasElement = document.createElement("canvas");
  private procCtx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private pose: Float32Array | null = null;
  private focal = 0;
  private lastSeen = -1;
  private trackingLost = true;
  private stopped = false;
  /** printed side length of the marker's black square, metres */
  markerSize = 0.12;
  /** diorama width as a multiple of the marker size */
  boardFactor = 2.2;
  private gray: Uint8Array = new Uint8Array(0);

  constructor(private c: Controller, private mountUi: (parent: HTMLElement) => Ui, private onExit: () => void) {}

  async start(container: HTMLElement): Promise<void> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access needs a secure (HTTPS) page and a browser with camera support.");
    }
    this.wrap = document.createElement("div");
    this.wrap.className = "marker-view";
    this.wrap.innerHTML = `<video playsinline muted autoplay aria-hidden="true"></video><canvas class="ar-canvas" aria-label="Augmented reality view of the house and its two doors"></canvas>
      <p class="xr-status" role="status" aria-live="polite"></p><div class="marker-ui"></div>`;
    container.appendChild(this.wrap);
    this.video = this.wrap.querySelector("video")!;
    this.canvas = this.wrap.querySelector("canvas")!;
    this.status = this.wrap.querySelector(".xr-status");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (e) {
      this.wrap.remove();
      this.stopped = true;
      throw new Error("The camera could not be opened (" + (e instanceof Error ? e.name : "error") + "). Allow camera access or play on screen.");
    }
    if (this.stopped) {
      // exited while the permission prompt was open
      this.stream.getTracks().forEach((t) => t.stop());
      this.wrap.remove();
      return;
    }
    this.video.srcObject = this.stream;
    this.watchTrack();
    await this.video.play().catch(() => undefined);
    // preserveDrawingBuffer only for automated tests that read the canvas back (?glread=1)
    const glread = new URLSearchParams(location.search).has("glread");
    const gl = this.canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, antialias: true, preserveDrawingBuffer: glread });
    if (!gl) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.wrap.remove();
      throw new Error("WebGL2 is not available on this device.");
    }
    this.gl = gl;
    this.renderer = new Renderer(gl);
    this.painter = new HousePainter(this.renderer);
    this.procCtx = this.proc.getContext("2d", { willReadFrequently: true });
    this.ui = this.mountUi(this.wrap.querySelector<HTMLElement>(".marker-ui")!);
    this.ui.onExit = () => this.stop();
    this.setStatus("Point the camera at the printed marker on a table.");
    document.addEventListener("visibilitychange", this.onVisibility);
    this.raf = requestAnimationFrame(this.loop);
  }

  private setStatus(msg: string): void {
    if (!this.status) return;
    this.status.textContent = msg;
    this.status.hidden = !msg;
  }

  private onVisibility = (): void => {
    if (!document.hidden) void this.resumeCamera();
  };

  /** iOS pauses the video and may end camera tracks in the background. */
  private resuming = false;

  private async resumeCamera(): Promise<void> {
    if (this.stopped || !this.video || this.resuming) return;
    this.resuming = true;
    try {
      const track = this.stream?.getVideoTracks()[0];
      if (!track || track.readyState === "ended") {
        let fresh: MediaStream;
        try {
          fresh = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          });
        } catch {
          this.markLost("The camera stopped. Exit and start marker AR again.");
          return;
        }
        if (this.stopped) {
          fresh.getTracks().forEach((t) => t.stop()); // exited meanwhile: never leave the camera on
          return;
        }
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = fresh;
        this.video.srcObject = fresh;
        this.watchTrack();
      }
      await this.video.play().catch(() => undefined);
    } finally {
      this.resuming = false;
    }
  }

  private watchTrack(): void {
    this.stream?.getVideoTracks()[0]?.addEventListener("ended", () => this.markLost("The camera stopped. Return to the app to resume."));
  }

  private markLost(msg: string): void {
    this.pose = null;
    this.trackingLost = true;
    this.setStatus(msg);
  }

  private loop = (ms: number): void => {
    if (this.stopped) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = ms / 1000;
    const video = this.video!, canvas = this.canvas!, gl = this.gl!;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
      this.focal = 0.8 * Math.max(vw, vh); // initial guess, refined from the marker
    }
    if (!video.paused && video.readyState >= 2) this.track(now, vw, vh);
    else if (!this.trackingLost && now - this.lastSeen > 0.5) this.markLost("Camera paused. Return to the app or tap Exit.");
    gl.viewport(0, 0, vw, vh);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (this.pose) {
      const fovy = 2 * Math.atan(vh / (2 * this.focal));
      this.renderer!.begin(perspective(fovy, vw / vh, 0.01, 20));
      this.painter!.draw(this.pose, this.c, this.markerSize * this.boardFactor, performance.now() / 1000);
    }
  };

  private track(now: number, vw: number, vh: number): void {
    const pw = PROC_WIDTH, ph = Math.round((PROC_WIDTH * vh) / vw);
    if (this.proc.width !== pw || this.proc.height !== ph) {
      this.proc.width = pw;
      this.proc.height = ph;
      this.gray = new Uint8Array(pw * ph);
    }
    const ctx = this.procCtx!;
    ctx.drawImage(this.video!, 0, 0, pw, ph);
    const data = ctx.getImageData(0, 0, pw, ph).data;
    const g = this.gray;
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (data[j]! * 77 + data[j + 1]! * 150 + data[j + 2]! * 29) >> 8;
    const corners = findMarker(g, pw, ph);
    if (corners) {
      const k = vw / pw;
      const img: Pt[] = corners.map(([x, y]) => [x * k - vw / 2, y * k - vh / 2]);
      const L = this.markerSize;
      const plane: Pt[] = [[-L / 2, -L / 2], [L / 2, -L / 2], [L / 2, L / 2], [-L / 2, L / 2]];
      const H = homography(plane, img);
      if (H) {
        const f = focalFromH(H);
        const lo = 0.5 * Math.max(vw, vh), hi = 2 * Math.max(vw, vh);
        if (f && f > lo && f < hi) this.focal = 0.9 * this.focal + 0.1 * f;
        const p = poseFromH(H, this.focal);
        if (p) {
          this.pose = this.pose ? smooth(this.pose, p, 0.5) : p;
          this.lastSeen = now;
          if (this.trackingLost) {
            this.trackingLost = false;
            this.setStatus("");
          }
        }
      }
    }
    if (now - this.lastSeen > 0.5 && !this.trackingLost && this.lastSeen >= 0) {
      this.markLost("Marker lost. Keep the whole printed marker in view.");
    }
  }

  /** Test hook: is the marker currently tracked? */
  get tracking(): boolean {
    return !!this.pose;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ui?.dispose();
    this.renderer?.dispose();
    this.wrap?.remove();
    this.onExit();
  }
}

function smooth(a: Float32Array, b: Float32Array, k: number): Float32Array {
  // blend then re-orthonormalise the rotation part
  const o = new Float32Array(16);
  for (let i = 0; i < 16; i++) o[i] = a[i]! * (1 - k) + b[i]! * k;
  const x: Vec3 = [o[0]!, o[1]!, o[2]!], z: Vec3 = [o[8]!, o[9]!, o[10]!];
  const nx = norm(x);
  const y = norm(cross(z, nx));
  const nz = cross(nx, y);
  o.set([nx[0], nx[1], nx[2], 0, y[0], y[1], y[2], 0, nz[0], nz[1], nz[2], 0], 0);
  o[15] = 1;
  const id = new Float32Array(16);
  id[0] = id[5] = id[10] = id[15] = 1;
  return multiply(o, id);
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
