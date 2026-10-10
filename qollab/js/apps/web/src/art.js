/**
 * Procedural horror art (Canvas 2D), drawn in code: no image files.
 * The creature is an original design for this game (a hooded figure in Mira's
 * raincoat, a cracked porcelain-pale face, hollow eyes, a mouth too wide).
 *
 * Nothing drawn before the decision depends on who is really calling: both
 * door cameras always show the same hooded figure.
 */
/** Small deterministic noise so cracks and textures do not shimmer between frames. */
function prng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** A porch at night seen from a door camera, without the figure. */
export function drawPorch(g, x, y, w, h, t, opts) {
    const rnd = prng(opts.seed);
    // wall with siding
    const wall = g.createLinearGradient(0, y, 0, y + h);
    wall.addColorStop(0, "#0a0f0f");
    wall.addColorStop(0.75, "#141b1a");
    wall.addColorStop(1, "#070909");
    g.fillStyle = wall;
    g.fillRect(x, y, w, h);
    g.strokeStyle = "rgba(255,255,255,0.035)";
    g.lineWidth = 1;
    for (let yy = y + 6; yy < y + h * 0.82; yy += 9) {
        g.beginPath();
        g.moveTo(x, yy);
        g.lineTo(x + w, yy + 1);
        g.stroke();
    }
    // door
    const doorW = w * 0.3, doorH = h * 0.66, doorX = x + w * 0.35, doorY = y + h * 0.15;
    g.fillStyle = "#050505";
    g.fillRect(doorX - 7, doorY - 7, doorW + 14, doorH + 7);
    if (opts.open === "no") {
        const dg = g.createLinearGradient(doorX, 0, doorX + doorW, 0);
        dg.addColorStop(0, "#1d150e");
        dg.addColorStop(1, "#2a1f15");
        g.fillStyle = dg;
        g.fillRect(doorX, doorY, doorW, doorH);
        g.strokeStyle = "rgba(0,0,0,0.6)";
        g.lineWidth = 2;
        for (const [px, py, pw, ph] of [[0.12, 0.06, 0.76, 0.36], [0.12, 0.5, 0.76, 0.42]])
            g.strokeRect(doorX + doorW * px, doorY + doorH * py, doorW * pw, doorH * ph);
        g.fillStyle = "#6b5a3e";
        g.beginPath();
        g.arc(doorX + doorW * 0.85, doorY + doorH * 0.52, 2.5, 0, Math.PI * 2);
        g.fill();
    }
    else {
        const inner = g.createLinearGradient(0, doorY, 0, doorY + doorH);
        if (opts.open === "warm") {
            inner.addColorStop(0, "#f3c57a");
            inner.addColorStop(1, "#8a5a24");
        }
        else {
            inner.addColorStop(0, "#000");
            inner.addColorStop(1, "#050202");
        }
        g.fillStyle = inner;
        g.fillRect(doorX, doorY, doorW, doorH);
    }
    // porch floor with wet reflections
    const floorY = doorY + doorH;
    const fl = g.createLinearGradient(0, floorY, 0, y + h);
    fl.addColorStop(0, "#1b201f");
    fl.addColorStop(1, "#050606");
    g.fillStyle = fl;
    g.fillRect(x, floorY, w, y + h - floorY);
    // lamp cone
    if (opts.lamp > 0.02) {
        const lx = doorX + doorW / 2, ly = doorY - 16;
        const cone = g.createRadialGradient(lx, ly, 2, lx, ly + h * 0.35, h * 0.75);
        cone.addColorStop(0, `rgba(255,214,150,${0.42 * opts.lamp})`);
        cone.addColorStop(0.35, `rgba(255,190,120,${0.12 * opts.lamp})`);
        cone.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = cone;
        g.fillRect(x, y, w, h);
        g.fillStyle = `rgba(255,230,180,${0.9 * opts.lamp})`;
        g.beginPath();
        g.arc(lx, ly, 3.5, 0, Math.PI * 2);
        g.fill();
    }
    // rain
    g.strokeStyle = "rgba(200,220,230,0.16)";
    g.lineWidth = 1;
    for (let i = 0; i < 46; i++) {
        const rx = x + ((rnd() * w + t * 40 * (0.6 + rnd())) % w);
        const ry = y + ((rnd() * h + t * 520 * (0.7 + rnd() * 0.6)) % h);
        g.beginPath();
        g.moveTo(rx, ry);
        g.lineTo(rx - 2, ry + 12);
        g.stroke();
    }
    return { doorX, doorY, doorW, doorH };
}
/**
 * The hooded figure on the porch. `lean` animates a slow head tilt; `near`
 * (0..1) brings it closer to the camera. Identical for Mira and the mimic.
 */
export function drawFigure(g, cx, footY, h, t, alpha, near = 0, still = false) {
    if (alpha <= 0.01)
        return;
    const s = h * (1 + near * 0.9);
    const sway = still ? 0 : Math.sin(t * 0.6) * s * 0.006;
    const tilt = still ? 0.12 : 0.12 + Math.sin(t * 0.23) * 0.05;
    g.save();
    g.globalAlpha = alpha;
    g.translate(cx + sway, footY + near * s * 0.15);
    // shadow on the wet floor
    const sh = g.createRadialGradient(0, 0, 2, 0, 0, s * 0.35);
    sh.addColorStop(0, "rgba(0,0,0,0.6)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sh;
    g.beginPath();
    g.ellipse(0, 0, s * 0.35, s * 0.06, 0, 0, Math.PI * 2);
    g.fill();
    // coat: tall, too narrow at the shoulders, hem dripping
    const coat = g.createLinearGradient(-s * 0.2, -s, s * 0.2, 0);
    coat.addColorStop(0, "#0b0c0d");
    coat.addColorStop(0.5, "#16191a");
    coat.addColorStop(1, "#060707");
    g.fillStyle = coat;
    g.beginPath();
    g.moveTo(-s * 0.2, 0);
    g.bezierCurveTo(-s * 0.21, -s * 0.35, -s * 0.15, -s * 0.66, -s * 0.09, -s * 0.78);
    g.lineTo(s * 0.09, -s * 0.78);
    g.bezierCurveTo(s * 0.15, -s * 0.66, s * 0.21, -s * 0.35, s * 0.2, 0);
    for (let i = 0; i <= 8; i++)
        g.lineTo(s * (0.2 - i * 0.05), (i % 2 ? s * 0.02 : 0));
    g.closePath();
    g.fill();
    // arms too long, fingers past the knees
    g.strokeStyle = "#0a0b0c";
    g.lineCap = "round";
    g.lineWidth = s * 0.045;
    for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(side * s * 0.1, -s * 0.74);
        g.quadraticCurveTo(side * s * 0.2, -s * 0.45, side * s * 0.17, -s * 0.2);
        g.stroke();
        g.lineWidth = s * 0.008;
        g.strokeStyle = "rgba(190,190,180,0.55)";
        for (let f = 0; f < 4; f++) {
            g.beginPath();
            g.moveTo(side * s * (0.16 + f * 0.008), -s * 0.2);
            g.lineTo(side * s * (0.155 + f * 0.012), -s * (0.12 - f * 0.006));
            g.stroke();
        }
        g.strokeStyle = "#0a0b0c";
        g.lineWidth = s * 0.045;
    }
    // hood, tilted, with a black void where the face should be
    g.save();
    g.translate(0, -s * 0.8);
    g.rotate(tilt);
    const hood = g.createRadialGradient(0, -s * 0.06, s * 0.02, 0, -s * 0.05, s * 0.14);
    hood.addColorStop(0, "#151718");
    hood.addColorStop(1, "#070808");
    g.fillStyle = hood;
    g.beginPath();
    g.ellipse(0, -s * 0.06, s * 0.085, s * 0.11, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#000";
    g.beginPath();
    g.ellipse(0, -s * 0.045, s * 0.052, s * 0.072, 0, 0, Math.PI * 2);
    g.fill();
    // a pale face, half lost in the hood: hollow eyes, no expression
    const face = g.createRadialGradient(-s * 0.008, -s * 0.06, s * 0.004, 0, -s * 0.04, s * 0.06);
    face.addColorStop(0, "rgba(214,208,192,0.55)");
    face.addColorStop(0.7, "rgba(150,145,130,0.25)");
    face.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = face;
    g.beginPath();
    g.ellipse(0, -s * 0.035, s * 0.036, s * 0.055, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.92)";
    for (const side of [-1, 1]) {
        g.beginPath();
        g.ellipse(side * s * 0.015, -s * 0.05, s * 0.009, s * 0.013, side * 0.2, 0, Math.PI * 2);
        g.fill();
    }
    g.fillStyle = "rgba(0,0,0,0.5)";
    g.fillRect(-s * 0.002, -s * 0.04, s * 0.004, s * 0.018);
    // wet hair hanging over the face
    g.strokeStyle = "rgba(4,4,4,0.9)";
    g.lineWidth = Math.max(1, s * 0.004);
    for (let k = -5; k <= 5; k++) {
        g.beginPath();
        g.moveTo(k * s * 0.008, -s * 0.105);
        g.quadraticCurveTo(k * s * 0.011, -s * 0.05, k * s * 0.012 + Math.sin(k) * s * 0.004, s * (0.03 + 0.01 * Math.abs(k % 3)));
        g.stroke();
    }
    g.restore();
    g.restore();
}
/** Full-frame close-up of the mimic, for the reveal (jump scare). */
export function drawMimicFace(g, w, h, t, intensity = 1) {
    const rnd = prng(1337);
    g.save();
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    const shake = intensity > 0.5 ? (Math.random() - 0.5) * 8 * intensity : 0;
    const cx = w / 2 + shake, cy = h * 0.58;
    const fw = h * 0.5, fh = h * 0.95;
    g.translate(cx, cy);
    g.rotate(0.14 + Math.sin(t * 3) * 0.01);
    // hood and wet hair
    g.fillStyle = "#030303";
    g.beginPath();
    g.ellipse(0, -fh * 0.15, fw * 1.4, fh * 0.85, 0, 0, Math.PI * 2);
    g.fill();
    // face: grey, waxy, too long
    const skin = g.createRadialGradient(-fw * 0.2, -fh * 0.3, fw * 0.05, 0, 0, fw * 1.15);
    skin.addColorStop(0, "#c8c6ba");
    skin.addColorStop(0.5, "#8a887c");
    skin.addColorStop(1, "#141412");
    g.fillStyle = skin;
    g.beginPath();
    g.moveTo(0, -fh * 0.6);
    g.bezierCurveTo(fw * 0.82, -fh * 0.58, fw * 0.66, fh * 0.32, fw * 0.12, fh * 0.56);
    g.quadraticCurveTo(0, fh * 0.62, -fw * 0.12, fh * 0.56);
    g.bezierCurveTo(-fw * 0.66, fh * 0.32, -fw * 0.82, -fh * 0.58, 0, -fh * 0.6);
    g.fill();
    // mottled texture
    for (let k = 0; k < 140; k++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? "20,18,15" : "210,205,190"},${0.05 + rnd() * 0.07})`;
        g.beginPath();
        g.arc((rnd() - 0.5) * fw * 1.2, (rnd() - 0.6) * fh, rnd() * fw * 0.06, 0, Math.PI * 2);
        g.fill();
    }
    // cracks
    g.strokeStyle = "rgba(15,12,10,0.8)";
    g.lineWidth = 1.5;
    for (let c = 0; c < 10; c++) {
        let px = (rnd() - 0.5) * fw * 1.1, py = (rnd() - 0.7) * fh * 0.9;
        g.beginPath();
        g.moveTo(px, py);
        for (let k = 0; k < 6; k++) {
            px += (rnd() - 0.5) * fw * 0.16;
            py += rnd() * fh * 0.06;
            g.lineTo(px, py);
        }
        g.stroke();
    }
    // eyes: deep black sockets that weep down the cheeks, mismatched pinpricks
    for (const side of [-1, 1]) {
        const ex = side * fw * 0.3, ey = -fh * 0.16;
        const eg = g.createRadialGradient(ex, ey, 1, ex, ey, fw * 0.27);
        eg.addColorStop(0, "#000");
        eg.addColorStop(0.6, "rgba(0,0,0,0.98)");
        eg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = eg;
        g.beginPath();
        g.ellipse(ex, ey, fw * 0.24, fw * (side < 0 ? 0.3 : 0.25), side * 0.18, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(0,0,0,0.75)";
        g.lineWidth = fw * 0.025;
        for (let d = 0; d < 2; d++) {
            g.beginPath();
            g.moveTo(ex + (d - 0.5) * fw * 0.08, ey + fw * 0.18);
            g.bezierCurveTo(ex + (d - 0.5) * fw * 0.1, ey + fh * 0.2, ex + (d - 0.3) * fw * 0.06, ey + fh * 0.3, ex + (d - 0.4) * fw * 0.08, ey + fh * (0.34 + d * 0.06));
            g.stroke();
        }
        g.fillStyle = "#f2efe6";
        g.beginPath();
        g.arc(ex + side * fw * 0.03, ey + (side < 0 ? fw * 0.05 : -fw * 0.02), fw * (side < 0 ? 0.022 : 0.015), 0, Math.PI * 2);
        g.fill();
    }
    // mouth: torn far too wide and hanging open, uneven teeth
    const my = fh * 0.2, mw = fw * 0.62, open = fh * (0.16 + 0.03 * Math.sin(t * 18) * intensity);
    g.fillStyle = "#050000";
    g.beginPath();
    g.moveTo(-mw, my - fh * 0.03);
    g.bezierCurveTo(-mw * 0.5, my - fh * 0.06, mw * 0.5, my - fh * 0.06, mw, my - fh * 0.03);
    g.bezierCurveTo(mw * 0.6, my + open, -mw * 0.6, my + open, -mw, my - fh * 0.03);
    g.fill();
    g.fillStyle = "rgba(205,195,170,0.9)";
    for (let k = -8; k <= 8; k++) {
        const tx = (k / 9) * mw * 0.9, tw = mw * 0.045, topY = my - fh * 0.045 + Math.abs(k / 9) * fh * 0.02;
        const len = fh * (0.035 + rnd() * 0.03) * (1 - Math.abs(k / 9) * 0.4);
        g.beginPath();
        g.moveTo(tx - tw, topY);
        g.lineTo(tx + tw, topY);
        g.lineTo(tx + rnd() * tw * 0.4, topY + len);
        g.closePath();
        g.fill();
        const botY = my + open * 0.62 - Math.abs(k / 9) * open * 0.45;
        g.beginPath();
        g.moveTo(tx - tw, botY);
        g.lineTo(tx + tw, botY);
        g.lineTo(tx, botY - len * 0.8);
        g.closePath();
        g.fill();
    }
    g.restore();
    g.save();
    g.globalCompositeOperation = "multiply";
    g.fillStyle = "rgba(150,30,25,0.45)";
    g.fillRect(0, 0, w, h);
    g.restore();
    postProcess(g, 0, 0, w, h, t, { tint: "none", strength: intensity });
}
/** Night-vision CCTV treatment: tint, vignette, scanlines, grain. */
export function postProcess(g, x, y, w, h, t, opts = {}) {
    const k = opts.strength ?? 1;
    g.save();
    if (opts.tint !== "none") {
        g.globalCompositeOperation = "color";
        g.fillStyle = opts.tint === "red" ? `rgba(140,10,10,${0.35 * k})` : "rgba(70,110,90,0.45)";
        g.fillRect(x, y, w, h);
        g.globalCompositeOperation = "source-over";
    }
    const v = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.25, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.85)");
    g.fillStyle = v;
    g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(0,0,0,0.18)";
    for (let yy = y; yy < y + h; yy += 3)
        g.fillRect(x, yy, w, 1);
    if (opts.grain !== false) {
        for (let i = 0; i < (w * h) / 900; i++) {
            g.fillStyle = `rgba(255,255,255,${Math.random() * 0.1})`;
            g.fillRect(x + Math.random() * w, y + Math.random() * h, 1.5, 1.5);
        }
    }
    g.restore();
}
/** Render the figure into an offscreen canvas (for the AR billboard texture). */
export function figureSprite(size = 256) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size * 2;
    const g = c.getContext("2d");
    drawFigure(g, size / 2, size * 2 - 6, size * 1.9, 0, 1, 0, true);
    return c;
}
