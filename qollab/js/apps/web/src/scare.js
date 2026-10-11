/**
 * Full-screen scares for the AR modes. In AR the house is small on the table,
 * so the reveal is drawn over the whole phone screen instead:
 *   - let the mimic in: its face fills the screen, then "SIGNAL LOST";
 *   - hang up on the mimic: a split-second close-up of the hood looking at you;
 *   - a broken (static) line: something pressed against the lens for a moment.
 * Everything here happens after a measured outcome or the decision, so it never
 * reveals who is calling before the player decides. Gentle mode keeps only a
 * softened face; reduced motion removes the shake and the flashes.
 */
import { drawFigure, drawLensFlash, drawMimicFace, postProcess } from "./art.js";
export class ScareLayer {
    c;
    canvas;
    g;
    raf = 0;
    alive = true;
    shown = false;
    constructor(parent, c) {
        this.c = c;
        this.canvas = document.createElement("canvas");
        this.canvas.className = "scare-layer";
        this.canvas.setAttribute("aria-hidden", "true");
        this.canvas.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:50;pointer-events:none;display:none";
        parent.appendChild(this.canvas);
        this.g = this.canvas.getContext("2d");
        this.raf = requestAnimationFrame(this.loop);
    }
    /** What to draw now, if anything (exposed for tests). */
    phase(now) {
        const v = this.c.visual, s = this.c.settings;
        const age = now - v.resultAt;
        if (v.result === "letIn") {
            if (age >= 0.9 && age < 3.4)
                return "face";
            if (age >= 3.4 && age < 5.4)
                return "lost";
            return null;
        }
        if (s.gentle || s.reducedMotion)
            return null;
        if (v.result === "refused")
            return age >= 1.4 && age < 1.9 ? "look" : null;
        if (v.result)
            return null;
        const since = now - v.lastCallAt;
        if (v.last && v.last.line === "static" && v.last.kind === "listen" && since > 0.25 && since < 0.42)
            return "lens";
        return null;
    }
    loop = () => {
        if (!this.alive)
            return;
        if (!this.canvas.isConnected) {
            this.dispose();
            return;
        }
        this.raf = requestAnimationFrame(this.loop);
        const now = performance.now() / 1000;
        const p = this.phase(now);
        if (!p) {
            if (this.shown) {
                this.canvas.style.display = "none";
                this.shown = false;
            }
            return;
        }
        if (!this.shown) {
            this.canvas.style.display = "block";
            this.shown = true;
        }
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const W = Math.round(window.innerWidth * dpr), H = Math.round(window.innerHeight * dpr);
        if (this.canvas.width !== W || this.canvas.height !== H) {
            this.canvas.width = W;
            this.canvas.height = H;
        }
        const g = this.g, gentle = this.c.settings.gentle, calm = this.c.settings.reducedMotion;
        g.clearRect(0, 0, W, H);
        const age = now - this.c.visual.resultAt;
        if (p === "face") {
            // keep the whole face on a portrait phone: scale it to the width
            drawMimicFace(g, W, H, now, gentle ? 0.3 : calm ? 0.45 : 1, Math.min(H, W * 1.45));
            if (!gentle && !calm && age < 1.05) { // the first frames: a white flash
                g.fillStyle = `rgba(255,245,240,${0.8 * (1 - (age - 0.9) / 0.15)})`;
                g.fillRect(0, 0, W, H);
            }
        }
        else if (p === "lost") {
            g.globalAlpha = Math.max(0, 1 - (age - 3.4) / 2);
            g.fillStyle = "#000";
            g.fillRect(0, 0, W, H);
            g.fillStyle = "rgba(230,60,50,0.95)";
            g.font = `600 ${Math.round(22 * dpr)}px ui-monospace, Menlo, monospace`;
            g.textAlign = "center";
            g.fillText("SIGNAL LOST", W / 2, H / 2);
            g.textAlign = "start";
            g.globalAlpha = 1;
        }
        else if (p === "look") {
            g.fillStyle = "#020303";
            g.fillRect(0, 0, W, H);
            const s = H * 3.2; // the hood, far too close, looking straight into the lens
            drawFigure(g, W / 2, H * 0.5 + s * 0.86, s, now, 1, 0, true, 1);
            postProcess(g, 0, 0, W, H, now, { tint: "green" });
        }
        else {
            drawLensFlash(g, 0, 0, W, H, 1);
            postProcess(g, 0, 0, W, H, now, { tint: "green", grain: true });
        }
    };
    dispose() {
        this.alive = false;
        cancelAnimationFrame(this.raf);
        this.canvas.remove();
    }
}
