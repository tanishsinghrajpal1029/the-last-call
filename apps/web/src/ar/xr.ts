/**
 * Markerless tracked AR via WebXR 'immersive-ar' + hit-test (Chrome on
 * ARCore-capable Android). The house is placed on a detected surface, held by
 * an XRAnchor when supported (otherwise a fixed pose in the 'local' space),
 * and never re-attached to the phone after placement. Controls are a DOM
 * overlay (required).
 *
 * Adapted from the Dark Sweeper WebXR view (same author, this hackathon).
 * Untested on a physical device at the time of writing: see docs/AR_DEVICE_TESTS.md.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Controller } from "../controller.js";
import { Ui } from "../ui.js";
import { Renderer } from "./gl.js";
import { Mat4, multiply, rotationY, scaling, translation, Vec3 } from "./math.js";
import { HousePainter } from "./scene.js";

type AnyXR = any;

export async function xrSupported(): Promise<boolean> {
  const xr: AnyXR = (navigator as any).xr;
  if (!xr || !window.isSecureContext) return false;
  try {
    return await xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

export class XrView {
  private xrSession: AnyXR = null;
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private renderer: Renderer | null = null;
  private painter: HousePainter | null = null;
  ui: Ui | null = null;
  private overlay: HTMLElement | null = null;
  private refSpace: AnyXR = null;
  private viewerSpace: AnyXR = null;
  private hitSource: AnyXR = null;
  private reticle: Mat4 | null = null;
  private board: Mat4 | null = null;
  private anchor: AnyXR = null;
  private boardWidth = 0.4;
  private placing = true;
  private trackingLost = false;
  private ended = false;
  private placeBar: HTMLElement | null = null;
  private uiRoot: HTMLElement | null = null;
  private lastViewer: { pos: Vec3 } | null = null;
  private placementId = 0;

  constructor(private c: Controller, private mountUi: (parent: HTMLElement) => Ui, private onExit: () => void) {}

  async start(container: HTMLElement): Promise<void> {
    const xr: AnyXR = (navigator as any).xr;
    this.overlay = document.createElement("div");
    this.overlay.className = "xr-overlay";
    container.appendChild(this.overlay);
    this.uiRoot = document.createElement("div");
    this.uiRoot.className = "xr-ui";
    this.overlay.appendChild(this.uiRoot);
    this.placeBar = document.createElement("div");
    this.placeBar.className = "place-bar";
    this.placeBar.innerHTML = `<p role="status" aria-live="polite">Move your phone slowly over a table until the ring appears, then tap the screen to place the house.</p>
      <div class="place-buttons"><button type="button" class="btn btn-ghost" id="size-down">Smaller</button>
      <span id="size-label"></span>
      <button type="button" class="btn btn-ghost" id="size-up">Larger</button>
      <button type="button" class="btn btn-ghost" id="place-exit">Exit</button></div>`;
    this.overlay.appendChild(this.placeBar);
    this.placeBar.addEventListener("beforexrselect", (e) => e.preventDefault());
    this.placeBar.querySelector("#size-down")!.addEventListener("click", () => this.resize(-0.05));
    this.placeBar.querySelector("#size-up")!.addEventListener("click", () => this.resize(0.05));
    this.placeBar.querySelector("#place-exit")!.addEventListener("click", () => void this.stop());
    this.resize(0);

    this.xrSession = await xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test", "local"],
      optionalFeatures: ["dom-overlay", "anchors"],
      domOverlay: { root: this.overlay },
    });
    const sess = this.xrSession;
    if (this.ended) {
      // Exit was tapped while the session was starting: end it rather than orphan it
      this.xrSession = null;
      await sess.end().catch(() => undefined);
      return;
    }
    sess.addEventListener("end", this.onEnd); // registered first so an early end always cleans up
    try {
      await this.initSession(sess);
    } catch (e) {
      this.ended = true;
      await sess.end().catch(() => undefined);
      this.cleanupResources();
      throw e;
    }
  }

  private async initSession(sess: AnyXR): Promise<void> {
    if (!sess.domOverlayState) {
      throw new Error("This browser started AR without DOM overlay support, so the controls cannot be shown. Try marker AR or play on screen.");
    }
    this.canvas = document.createElement("canvas");
    this.gl = this.canvas.getContext("webgl2", { xrCompatible: true, alpha: true, antialias: true } as any) as WebGL2RenderingContext;
    if (!this.gl) throw new Error("WebGL2 is not available.");
    await (this.gl as any).makeXRCompatible();
    sess.updateRenderState({ baseLayer: new (window as any).XRWebGLLayer(sess, this.gl) });
    this.refSpace = await sess.requestReferenceSpace("local");
    this.viewerSpace = await sess.requestReferenceSpace("viewer");
    this.hitSource = await sess.requestHitTestSource({ space: this.viewerSpace });
    this.renderer = new Renderer(this.gl);
    this.painter = new HousePainter(this.renderer);
    this.ui = this.mountUi(this.uiRoot!);
    this.ui.onExit = () => void this.stop();
    this.ui.onReposition = () => this.reposition();
    this.uiRoot!.hidden = true; // shown after placement
    sess.addEventListener("select", this.onSelect);
    sess.addEventListener("visibilitychange", this.onVisibility);
    sess.requestAnimationFrame(this.onFrame);
  }

  private resize(d: number): void {
    this.boardWidth = Math.min(0.5, Math.max(0.3, Math.round((this.boardWidth + d) * 100) / 100));
    const l = this.placeBar?.querySelector("#size-label");
    if (l) l.textContent = "Width " + Math.round(this.boardWidth * 100) + " cm";
  }

  /** Back to placement (from the HUD "Move house" action). */
  reposition(): void {
    this.placing = true;
    this.board = null;
    this.placementId++;
    if (this.anchor && this.anchor.delete) this.anchor.delete();
    this.anchor = null;
    if (this.placeBar) this.placeBar.hidden = false;
    if (this.uiRoot) this.uiRoot.hidden = true;
  }

  private onSelect = (ev: AnyXR): void => {
    if (!this.placing || !this.reticle || !this.lastViewer) return;
    const pos: Vec3 = [this.reticle[12]!, this.reticle[13]!, this.reticle[14]!];
    const yaw = Math.atan2(this.lastViewer.pos[0] - pos[0], this.lastViewer.pos[2] - pos[2]);
    this.board = multiply(translation(pos[0], pos[1], pos[2]), rotationY(yaw));
    const frame = ev.frame;
    const XRRigidTransform = (window as any).XRRigidTransform;
    if (frame && frame.createAnchor && XRRigidTransform) {
      const q = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
      const id = ++this.placementId;
      frame.createAnchor(new XRRigidTransform({ x: pos[0], y: pos[1], z: pos[2] }, q), this.refSpace)
        .then((a: AnyXR) => {
          if (id !== this.placementId || this.ended) {
            if (a && a.delete) a.delete();
            return;
          }
          if (this.anchor && this.anchor.delete) this.anchor.delete();
          this.anchor = a;
        })
        .catch(() => undefined); // fallback: keep the fixed pose
    }
    this.placing = false;
    if (this.placeBar) this.placeBar.hidden = true;
    if (this.uiRoot) this.uiRoot.hidden = false;
  };

  private onVisibility = (): void => {
    /* the game has no running timers that need pausing */
  };

  private onEnd = (): void => {
    if (this.ended) {
      this.cleanupResources();
      return;
    }
    this.cleanup();
    this.onExit();
  };

  private onFrame = (time: number, frame: AnyXR): void => {
    if (this.ended) return;
    const sess = this.xrSession;
    sess.requestAnimationFrame(this.onFrame);
    const now = performance.now() / 1000;
    void time;
    const gl = this.gl!;
    const layer = sess.renderState.baseLayer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const pose = frame.getViewerPose(this.refSpace);
    if (!pose) {
      if (!this.trackingLost) {
        this.trackingLost = true;
        this.setStatus("Tracking lost. Move the phone slowly over the table.");
      }
      return;
    }
    if (this.trackingLost) {
      this.trackingLost = false;
      this.setStatus("");
    }
    const vt = pose.transform.position;
    this.lastViewer = { pos: [vt.x, vt.y, vt.z] };
    if (this.placing && this.hitSource) {
      const hits = frame.getHitTestResults(this.hitSource);
      const hp = hits.length ? hits[0].getPose(this.refSpace) : null;
      this.reticle = hp ? new Float32Array(hp.transform.matrix) : null;
    }
    if (!this.placing && this.anchor) {
      const ap = frame.getPose(this.anchor.anchorSpace, this.refSpace);
      if (ap) this.board = new Float32Array(ap.transform.matrix);
    }
    for (const view of pose.views) {
      const vp = layer.getViewport(view);
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      const viewProj = multiply(new Float32Array(view.projectionMatrix), new Float32Array(view.transform.inverse.matrix));
      this.renderer!.begin(viewProj);
      if (this.placing && this.reticle) {
        this.renderer!.draw(this.renderer!.ring, multiply(this.reticle, scaling(0.12, 1, 0.12)), [1, 0.8, 0.3, 0.9], 1);
      }
      if (this.board) this.painter!.draw(this.board, this.c, this.boardWidth, now);
    }
  };

  private setStatus(msg: string): void {
    const el = this.overlay?.querySelector(".xr-status") as HTMLElement | null;
    let s = el;
    if (!s && this.overlay) {
      s = document.createElement("p");
      s.className = "xr-status";
      s.setAttribute("role", "status");
      this.overlay.appendChild(s);
    }
    if (s) {
      s.textContent = msg;
      s.hidden = !msg;
    }
  }

  async stop(): Promise<void> {
    if (this.xrSession && !this.ended) {
      await this.xrSession.end().catch(() => undefined); // triggers onEnd
    } else {
      this.cleanup();
      this.onExit();
    }
  }

  private cleanup(): void {
    if (this.ended) return;
    this.ended = true;
    this.cleanupResources();
  }

  private cleanupResources(): void {
    const sess = this.xrSession;
    if (sess) {
      sess.removeEventListener("select", this.onSelect);
      sess.removeEventListener("visibilitychange", this.onVisibility);
      sess.removeEventListener("end", this.onEnd);
    }
    if (this.hitSource && this.hitSource.cancel) this.hitSource.cancel();
    if (this.anchor && this.anchor.delete) this.anchor.delete();
    this.ui?.dispose();
    this.renderer?.dispose();
    this.overlay?.remove();
    this.ui = null;
    this.renderer = null;
    this.painter = null;
    this.overlay = null;
    this.anchor = null;
    this.xrSession = null;
    this.hitSource = null;
    this.board = null;
  }
}
