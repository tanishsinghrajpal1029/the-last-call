/**
 * DOM interface shared by every mode: on-screen ("screen"), WebXR overlay
 * ("xr"), marker AR ("marker") and look-around AR ("gyro"). Captions always
 * carry the full content of every spoken line and sound cue.
 *
 * Layout: the Guide (left) explains what to do now, why, and what it means in
 * quantum terms; the first call is a gated, staged walkthrough. The Case file
 * shows the two answers being built: WHO (from listens) and WHERE (from traces).
 */
import { posteriorSister, doorTally, dialInformation } from "../../../packages/core/src/evidence.js";
import { resultText } from "../../../packages/core/src/game.js";
import { CLEAR_LINES, endingText, INTRO, STATIC_LINES } from "../../../packages/core/src/lines.js";
import { correctDoor } from "../../../packages/core/src/nights.js";
import { dialAngle, rad, simulate } from "../../../packages/core/src/physics.js";
import { evidenceChart } from "./chart.js";
import { Feed } from "./feed.js";
import { caseStatus, explainCall, guideForCase, HESITATE, lossAdvice, reactionFor, STAGES, TUT_REACT } from "./guide.js";
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pct = (x) => Math.round(100 * x) + "%";
/** Never show 0% or 100% for a statistical judgement. */
const pctMeter = (x) => (x > 0.99 ? "over 99%" : x < 0.01 ? "under 1%" : Math.round(100 * x) + "%");
export class Ui {
    c;
    mode;
    audio;
    root;
    feed = null;
    off;
    skipTraceConfirm = new Set();
    sheetOpen = null;
    /** sheets stack: closing a sheet reopens the one beneath it (e.g. Settings over a result) */
    sheetStack = [];
    timers = [];
    disposed = false;
    lastFocus = null;
    /** walkthrough stage index (first call only) */
    stage = 0;
    stageSpoken = -1;
    lastExplain = null;
    /** walkthrough: the narrator's reaction to the result the player actually got */
    reaction = null;
    /** suspense: when the player last acted, and when the caller last spoke through the door */
    lastActive = performance.now();
    lastHesitate = -1e9;
    idleTimer = 0;
    onExit = null;
    onRestart = null;
    onReposition = null;
    /** set by the host to offer the bonus eraser scene after the ending */
    onBonus = null;
    /** the player chose to skip the walkthrough (call 1 is then played freely) */
    skipped = false;
    /** AR views may need to show/hide their own placement UI; called when the sheet state changes. */
    onSheet = null;
    constructor(parent, c, mode, audio) {
        this.c = c;
        this.mode = mode;
        this.audio = audio;
        this.root = document.createElement("div");
        this.root.className = "ui ui-" + mode + (mode === "screen" ? "" : " ui-ar");
        parent.appendChild(this.root);
        this.root.innerHTML = this.skeleton();
        if (mode === "screen")
            this.feed = new Feed(this.q("#feed-slot"), c);
        this.bind();
        void this.audio.loadVoices();
        this.off = c.on((e) => {
            if (e.type === "call")
                this.onCall(e.record);
            if (e.type === "result")
                this.onResult(e.result);
            if (e.type === "error")
                this.toast(e.message);
            if (e.type === "night") {
                this.stage = 0;
                this.lastExplain = null;
                this.reaction = null;
                this.showIntro();
            }
            if (e.type === "over")
                this.showEnding();
            if (e.type === "state")
                this.render();
        });
        this.render();
        this.showIntro();
        this.idleTimer = window.setInterval(() => this.hesitation(), 1000);
    }
    /** If the player hesitates, the caller speaks through the door (never on the line, never evidence). */
    hesitation() {
        const n = this.c.state.night, now = performance.now();
        if (this.disposed || this.c.phase !== "play" || n.result || this.sheetOpen || this.tutorial || this.c.view().night.tutorial) {
            this.lastActive = now;
            return;
        }
        if (now - this.lastActive < 22000 || now - this.lastHesitate < 30000)
            return;
        this.lastHesitate = now;
        const ids = Object.keys(HESITATE), id = ids[Math.floor(Math.random() * ids.length)];
        if (!this.c.settings.gentle)
            this.audio.footsteps(0.3);
        this.later(() => void this.audio.voiceLine(id, HESITATE[id]), 1500);
        this.toast(`Through the door: “${HESITATE[id]}” (not on the line, not evidence)`);
    }
    q(sel) {
        return this.root.querySelector(sel);
    }
    get tutorial() {
        return this.c.view().night.tutorial && !this.skipped && this.c.phase === "play" && !this.c.state.night.result;
    }
    allowed(a) {
        if (!this.tutorial)
            return true;
        const st = STAGES[this.stage];
        if (!st.allow.includes(a))
            return false;
        if (a !== "listen" && a !== "trace")
            return true;
        // never let optional calls use up the calls the remaining steps need
        const n = this.c.state.night;
        const complete = this.stageComplete();
        const completes = !complete && st.needs && st.needs.kind === a && (st.needs.dial === undefined || st.needs.dial === n.dial);
        if (completes)
            return n.callsLeft >= 1;
        const ahead = STAGES.slice(this.stage + 1).filter((s) => s.needs).length + (st.needs && !complete ? 1 : 0);
        return n.callsLeft > ahead;
    }
    skeleton() {
        const ar = this.mode !== "screen";
        return `
      <header class="top">
        <span class="chip" id="night-chip"></span>
        <span class="chip" id="calls-chip" aria-live="polite"></span>
        <span class="chip" id="score-chip"></span>
        <span class="top-buttons">
          ${this.mode === "xr" ? `<button type="button" class="btn btn-ghost" id="move-btn">Move house</button>` : ""}
          ${this.mode === "gyro" ? `<button type="button" class="btn btn-ghost" id="move-btn">Recenter</button>` : ""}
          <button type="button" class="btn btn-ghost" id="how-btn">How it works</button>
          <button type="button" class="btn btn-ghost" id="settings-btn">Settings</button>
          <button type="button" class="btn btn-ghost" id="exit-btn">Exit</button>
        </span>
      </header>
      <div class="col-left">
      <aside class="guide" id="guide" aria-label="Guide">
        <ol class="stepper" id="stepper" aria-label="Walkthrough steps"></ol>
        <div class="guide-card" id="guide-card" aria-live="polite"></div>
      </aside>
      <section class="casefile" id="casefile" aria-label="Case file">
        ${ar ? `<details id="ev-details"><summary>Case file</summary>` : `<h2 class="ev-h">Case file</h2>`}
        <div class="answer"><div class="answer-h"><span class="q">WHO</span> is calling? <span class="sub">built by listening</span></div><div id="meter"></div></div>
        <div class="answer"><div class="answer-h"><span class="q">WHERE</span> is she? <span class="sub">built by tracing</span></div><div id="doors"></div></div>
        <details class="vp" id="vp-details" ${ar ? "" : "open"}><summary>Voiceprint chart</summary>
          <p class="sub">How often the line came through clear at each dial setting. If your dots follow the solid line, it's Mira; the dashed line, it's the impostor.</p>
          <div id="chart"></div>
        </details>
        <details class="vp"><summary>Call log</summary><ol class="log" id="log" reversed></ol></details>
        ${ar ? `</details>` : ""}
      </section>
      </div>
      <div class="col-right">
      ${ar ? "" : `<div id="feed-slot" class="feed-slot"></div>`}
      <div class="caption" id="caption" aria-live="polite" aria-atomic="true"><p class="cap-line">…</p><p class="cap-meta"></p></div>
      <section class="controls" aria-label="Intercom controls">
        <div class="dial-row">
          <button type="button" class="btn btn-round" id="dial-down" aria-label="Turn dial left">◀</button>
          <div class="dial" id="dial" role="slider" tabindex="0" aria-label="Phase dial" aria-valuemin="0" aria-valuemax="7"></div>
          <button type="button" class="btn btn-round" id="dial-up" aria-label="Turn dial right">▶</button>
          <div class="dial-label" id="dial-label"></div>
        </div>
        <div class="call-row">
          <button type="button" class="btn btn-primary" id="listen-btn">Listen <span class="sub">→ WHO is it?</span></button>
          <button type="button" class="btn btn-trace" id="trace-btn">Trace <span class="sub">→ WHERE is she?</span></button>
        </div>
        <div class="decide-row">
          <button type="button" class="btn btn-door" id="open-front">Open front door</button>
          <button type="button" class="btn btn-door" id="open-side">Open side door</button>
          <button type="button" class="btn btn-hang" id="hangup">Hang up</button>
        </div>
      </section>
      </div>
      <div class="sheet-wrap" id="sheet-wrap" hidden><div class="sheet" id="sheet" role="dialog" aria-modal="true" tabindex="-1"></div></div>
      <div class="toast" id="toast" role="alert" hidden></div>`;
    }
    bind() {
        const c = this.c;
        const click = (id, fn) => this.q("#" + id).addEventListener("click", (e) => {
            e.preventDefault();
            this.audio.unlock();
            fn();
        });
        // AR: keep taps on the HUD from becoming XR select events
        this.root.addEventListener("beforexrselect", (e) => e.preventDefault());
        const turn = (d) => { if (!this.allowed("dial"))
            return; this.lastActive = performance.now(); c.setDial(c.state.night.dial + d); this.audio.dial(); };
        click("dial-down", () => turn(-1));
        click("dial-up", () => turn(1));
        click("listen-btn", () => { if (this.allowed("listen"))
            c.call("listen"); });
        click("trace-btn", () => { if (this.allowed("trace"))
            this.askTrace(); });
        click("open-front", () => { if (this.allowed("front"))
            this.askDecide("front"); });
        click("open-side", () => { if (this.allowed("side"))
            this.askDecide("side"); });
        click("hangup", () => { if (this.allowed("hangup"))
            this.askDecide("hangup"); });
        click("how-btn", () => this.showHow());
        if (this.mode === "xr" || this.mode === "gyro")
            click("move-btn", () => this.onReposition?.());
        click("settings-btn", () => this.showSettings());
        click("exit-btn", () => this.onExit?.());
        const dial = this.q("#dial");
        dial.addEventListener("keydown", (e) => {
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey)
                return;
            e.stopPropagation(); // the document handler must not move the dial a second time
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                turn(-1);
                e.preventDefault();
            }
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                turn(1);
                e.preventDefault();
            }
        });
        dial.addEventListener("click", (e) => {
            const t = e.target.closest("[data-k]");
            if (t && this.allowed("dial")) {
                this.audio.unlock();
                c.setDial(Number(t.dataset.k));
                this.audio.dial();
            }
        });
        this.q("#guide-card").addEventListener("click", (e) => {
            const b = e.target.closest("#stage-next");
            if (b) {
                e.preventDefault();
                this.audio.unlock();
                this.advanceStage();
            }
            if (e.target.closest("#stage-replay")) {
                e.preventDefault();
                this.audio.unlock();
                const st = STAGES[this.stage];
                if (this.stageComplete() && this.reaction)
                    void this.audio.voiceLine(this.reaction, TUT_REACT[this.reaction] ?? "");
                else
                    void this.audio.voiceLine(st.voice, "");
            }
        });
        if (this.mode === "screen")
            document.addEventListener("keydown", this.onKey);
    }
    onKey = (e) => {
        if (this.sheetOpen) {
            if (e.key === "Escape" && !e.repeat && (this.sheetOpen === "how" || this.sheetOpen === "settings" || this.sheetOpen === "confirm"))
                this.closeSheet();
            return;
        }
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey)
            return; // held keys and browser shortcuts never spend calls
        const tag = e.target?.tagName;
        if (tag === "INPUT" || tag === "BUTTON" && (e.key === " " || e.key === "Enter"))
            return;
        const k = e.key.toLowerCase();
        if (k === "l" && this.allowed("listen")) {
            this.audio.unlock();
            this.c.call("listen");
        }
        else if (k === "t" && this.allowed("trace")) {
            this.audio.unlock();
            this.askTrace();
        }
        else if (e.key === "ArrowLeft" && this.allowed("dial")) {
            this.c.setDial(this.c.state.night.dial - 1);
            this.audio.dial();
        }
        else if (e.key === "ArrowRight" && this.allowed("dial")) {
            this.c.setDial(this.c.state.night.dial + 1);
            this.audio.dial();
        }
    };
    // ---------- walkthrough ----------
    advanceStage() {
        if (!this.tutorial)
            return;
        if (this.stage < STAGES.length - 1)
            this.stage++;
        this.reaction = null;
        this.render();
    }
    /** Complete action stages automatically when their condition is met. */
    checkStage() {
        if (!this.tutorial)
            return;
        const st = STAGES[this.stage];
        if (st.done && st.done(this.c.state.night.log, this.c.state.night.dial)) {
            // show the explanation of the result first; the Next button moves on
            this.render();
        }
    }
    stageComplete() {
        const st = STAGES[this.stage];
        return !!st.done && st.done(this.c.state.night.log, this.c.state.night.dial);
    }
    renderGuide() {
        const c = this.c, v = c.view(), n = v.state, cfg = v.night;
        const stepper = this.q("#stepper"), card = this.q("#guide-card");
        const hl = (id) => {
            for (const b of this.root.querySelectorAll(".hl"))
                b.classList.remove("hl");
            if (id)
                this.q("#" + id)?.classList.add("hl");
        };
        if (cfg.tutorial && !this.skipped) {
            stepper.hidden = false;
            stepper.innerHTML = STAGES.map((s, i) => `<li class="${i < this.stage || (i === this.stage && n.result) ? "done" : i === this.stage ? "now" : ""}" ${i === this.stage ? 'aria-current="step"' : ""}><span class="num">${i < this.stage ? "✓" : i + 1}</span>${s.short}</li>`).join("");
        }
        else
            stepper.hidden = true;
        if (!this.tutorial) {
            hl(null);
            const leans = cfg.alphaChoicesDeg.some((a) => a !== 90);
            const alpha = c.meterAlphaDeg(), t = doorTally(n.log), listens = n.log.filter((r) => r.kind === "listen").length;
            const info = dialInformation(c.nights, cfg, alpha);
            const best = info.map((x, k) => [x, k]).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, k]) => k).sort((a, b) => a - b);
            const st = caseStatus(c.settings.meter ? posteriorSister(c.nights, cfg, alpha, n.log) : null, listens, t.front, t.side, leans, n.callsLeft, best);
            const status = !n.result && c.phase === "play" && !(cfg.tutorial && !this.skipped)
                ? `<div class="status" id="case-status"><p><strong>${esc(st.who)}</strong> · ${esc(st.where)} · ${n.callsLeft} call${n.callsLeft === 1 ? "" : "s"} left</p>${this.mode === "screen" ? `<p class="sub">Your options: ${st.options.map(esc).join(" · ")}</p>` : ""}</div>`
                : "";
            card.innerHTML = cfg.tutorial && !this.skipped && n.result
                ? `<h2>Walkthrough complete</h2><p>That's the whole game: <strong>listen</strong> to find out who, <strong>trace</strong> to find out where, then decide.</p>`
                : this.mode !== "screen"
                    ? status + `<details class="why"><summary>Goal: find out WHO (listen) and WHERE (trace), then decide</summary>${guideForCase(cfg, leans)}</details>` +
                        (this.lastExplain ? `<p class="ex-ar">${this.lastExplain.game}</p>` : "")
                    : `<h2>${esc(cfg.title)}</h2>${status}${guideForCase(cfg, leans)}` +
                        (this.lastExplain ? `<div class="explain"><p class="ex-h">What just happened</p><p>${this.lastExplain.game}</p><p class="quantum"><span class="qtag">Quantum</span> ${this.lastExplain.quantum}</p></div>` : "") +
                        `<details class="win"><summary>How scoring works</summary><ul><li>Mira, right door: +100 (+5 per unused call)</li><li>Mira, wrong door: +20</li><li>Hang up on Mira: 0</li><li>Hang up on the impostor: +100 (+5 per unused call)</li><li>Let the impostor in: −100</li></ul></details>`;
            return;
        }
        const st = STAGES[this.stage];
        const complete = this.stageComplete();
        const showNext = st.next || complete;
        card.innerHTML = `<p class="tag">Step ${this.stage + 1} of ${STAGES.length}</p><h2>${st.title}</h2>
      <p class="do">${complete ? "Done. Read what happened, then press Next." : st.doThis}</p>
      ${complete && this.reaction ? `<p class="narr">“${TUT_REACT[this.reaction]}”</p>` : ""}
      ${complete && this.lastExplain ? `<div class="explain"><p>${this.lastExplain.game}</p></div>` : ""}
      ${this.mode === "screen" ? `<p>${st.body}</p><p class="quantum"><span class="qtag">Quantum</span> ${st.quantum}</p>`
            : `<p class="body-ar">${st.body}</p><details class="why"><summary>The quantum part</summary><p class="quantum"><span class="qtag">Quantum</span> ${st.quantum}</p></details>`}
      <div class="sheet-buttons">${showNext && this.stage < STAGES.length - 1 ? `<button type="button" class="btn btn-primary" id="stage-next">Next</button>` : ""}<button type="button" class="btn btn-ghost" id="stage-replay" aria-label="Replay the narrator">▶ Replay</button></div>`;
        hl(complete ? "stage-next" : st.target ? st.target(n.dial) : null);
        if (this.stageSpoken !== this.stage && c.phase === "play") {
            this.stageSpoken = this.stage;
            void this.audio.voiceLine(st.voice, "");
        }
    }
    // ---------- rendering ----------
    render() {
        const c = this.c, v = c.view(), n = v.state, cfg = v.night, f = c.nights;
        this.q("#night-chip").textContent = cfg.tutorial ? `Walkthrough · ${cfg.title}` : `Call ${cfg.id} of ${f.nights.length} · ${cfg.title}`;
        this.q("#calls-chip").innerHTML = `Calls left <span class="pips" aria-label="${n.callsLeft} of ${n.budget}">${"●".repeat(n.callsLeft)}${"○".repeat(n.budget - n.callsLeft)}</span>`;
        this.q("#score-chip").textContent = `Score ${v.score}`;
        const playing = c.phase === "play";
        const ended = !!n.result;
        const can = (a) => playing && !ended && this.allowed(a);
        this.q("#listen-btn").disabled = !can("listen") || n.callsLeft <= 0;
        this.q("#trace-btn").disabled = !can("trace") || n.callsLeft <= 0;
        for (const [id, a] of [["open-front", "front"], ["open-side", "side"], ["hangup", "hangup"], ["dial-down", "dial"], ["dial-up", "dial"]]) {
            this.q("#" + id).disabled = !can(a);
        }
        // dial
        const steps = f.dialSteps;
        const dial = this.q("#dial");
        dial.setAttribute("aria-valuenow", String(n.dial));
        dial.setAttribute("aria-valuetext", `${n.dial}, ${(360 / steps) * n.dial} degrees`);
        let marks = "";
        for (let k = 0; k < steps; k++) {
            const a = (2 * Math.PI * k) / steps - Math.PI / 2;
            const x = 50 + 38 * Math.cos(a), y = 50 + 38 * Math.sin(a);
            marks += `<g data-k="${k}" class="dk${k === n.dial ? " on" : ""}"><circle cx="${x}" cy="${y}" r="9"/><text x="${x}" y="${y + 4}" text-anchor="middle">${k}</text></g>`;
        }
        const pa = (2 * Math.PI * n.dial) / steps - Math.PI / 2;
        dial.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="27" class="knob"/>
      <line x1="50" y1="50" x2="${50 + 22 * Math.cos(pa)}" y2="${50 + 22 * Math.sin(pa)}" class="needle"/>${marks}</svg>`;
        this.q("#dial-label").innerHTML = `Dial <strong>${n.dial}</strong><br><span class="sub">delays the side door's half of the call by ${(360 / steps) * n.dial}°</span>`;
        // case file
        const alpha = c.meterAlphaDeg();
        const t = doorTally(n.log);
        if (c.settings.meter) {
            const p = posteriorSister(f, cfg, alpha, n.log);
            const listens = n.log.filter((r) => r.kind === "listen").length;
            this.q("#meter").innerHTML = `<div class="tug" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(100 * p)}" aria-label="Chance it is Mira">
          <span class="end-l">Mira</span><span class="bar"><span class="fill" style="width:${(100 * p).toFixed(1)}%"></span><span class="mid"></span></span><span class="end-r">Impostor</span></div>
        <p class="sub">${listens ? `Chance it's Mira: <strong>${pctMeter(p)}</strong> after ${listens} listen${listens === 1 ? "" : "s"}.` : "No listens yet: 50/50."} Traces never move this.</p>`;
        }
        else
            this.q("#meter").innerHTML = `<p class="sub">WHO meter is off (Settings). Use the voiceprint chart.</p>`;
        const leans = cfg.alphaChoicesDeg.some((a) => a !== 90);
        this.q("#doors").innerHTML = `<p class="tally"><span>Front <strong>${"●".repeat(t.front) || "–"}</strong></span><span>Side <strong>${"●".repeat(t.side) || "–"}</strong></span></p>
      <p class="sub">${leans ? (t.front + t.side ? `Leans ${t.front === t.side ? "— tied, trace again" : t.front > t.side ? "front" : "side"} so far.` : "Trace to see which door the call leans toward.") : "Balanced tonight: either door works."}</p>`;
        this.q("#chart").innerHTML = evidenceChart(f, cfg, alpha, n.log, n.dial);
        this.q("#log").innerHTML = n.log.slice().reverse().map((r) => `<li><span class="lg-kind ${r.kind}">${r.kind === "trace" ? "Trace" : "Listen"}</span> dial ${r.dial} → <strong>${r.line}</strong>${r.door ? ` · ${r.door} door` : ""} <span class="lg-text">“${esc(r.text)}”</span></li>`).join("");
        this.renderGuide();
    }
    // ---------- events ----------
    onCall(r) {
        const cap = this.q("#caption");
        cap.classList.remove("flash-clear", "flash-static");
        void cap.offsetWidth;
        cap.classList.add(r.line === "clear" ? "flash-clear" : "flash-static");
        const meta = r.kind === "trace"
            ? `Traced at dial ${r.dial}: the call came through the <strong>${r.door} door</strong>. Line: ${r.line} (a coin flip once traced).`
            : `Listened at dial ${r.dial}: <strong>${r.line === "clear" ? "clear line" : "static"}</strong>.`;
        this.q("#caption").innerHTML = `<p class="cap-line">“${esc(r.text)}”</p><p class="cap-meta">${meta} <span class="sub">Source: ${esc(r.source)}.</span></p>`;
        // explanation for the Guide
        const plan = this.c.state.plan[this.c.state.index], cfg = this.c.view().night, f = this.c.nights;
        const pc = (theta) => simulate(rad(plan.alphaDeg), rad(theta), dialAngle(r.dial, f.dialSteps), false, this.c.sourceLabel.startsWith("the ideal model") ? null : f.noise)["clear"];
        this.lastExplain = explainCall(r, pc(f.sisterPhaseDeg), pc(cfg.mimicPhaseDeg));
        // sound and voice
        this.audio.lineOpen();
        const clearIdx = CLEAR_LINES.indexOf(r.text), staticIdx = STATIC_LINES.indexOf(r.text);
        this.lastActive = performance.now();
        // walkthrough: the narrator reacts to the result actually received, once the caller's line has played
        const react = this.tutorial ? reactionFor(STAGES[this.stage].id, r) : null;
        if (react)
            this.reaction = react;
        const lineId = r.line === "clear" ? "clear_" + clearIdx : "static_" + staticIdx;
        const speak = () => {
            if (r.line === "clear")
                void this.audio.voiceLine(lineId, r.text);
            else {
                this.audio.staticBurst();
                void this.audio.voiceLine(lineId, "");
            }
            if (react)
                void this.audio.clipSeconds(lineId).then((sec) => this.later(() => {
                    if (this.reaction === react)
                        void this.audio.voiceLine(react, TUT_REACT[react] ?? "");
                }, 500 + 1000 * Math.min(4, sec)));
        };
        if (r.kind === "trace") {
            this.audio.traceBeeps();
            this.later(speak, 750);
        }
        else
            this.later(speak, 200);
        if (!this.c.settings.gentle && Math.random() < 0.18)
            this.later(() => this.audio.knock(), 2600);
        // suspense: as the line runs out, footsteps on the porch get closer (the same at both doors)
        const nn = this.c.state.night;
        if (!this.c.view().night.tutorial && nn.budget && nn.callsLeft <= nn.budget / 2)
            this.later(() => this.audio.footsteps(1 - nn.callsLeft / nn.budget), 3200);
        if (this.c.state.night.callsLeft === 0) {
            if (this.tutorial)
                this.stage = STAGES.length - 1; // out of calls: go straight to the decision
            this.toast("That was the last call. Open a door or hang up.");
        }
        this.checkStage();
        this.render();
    }
    onResult(res) {
        const a = this.audio;
        a.stopVoice();
        if (res === "letIn") {
            a.door();
            this.later(() => { a.stinger(); void a.voiceLine("mimic_thanks", "Thank you.", true); }, 900);
        }
        else if (res === "refused") {
            this.later(() => void a.voiceLine("mimic_next", "Next time.", true), 400);
        }
        else if (res === "saved") {
            a.door();
            this.later(() => { a.relief(); void a.voiceLine("res_saved", "You took forever."); }, 900);
        }
        else if (res === "wrongDoor") {
            a.door();
            this.later(() => void a.voiceLine("res_wrong", "Wrong one."), 900);
        }
        this.later(() => this.showResult(res), res === "letIn" && !this.c.settings.gentle ? 3000 : 1600);
    }
    later(fn, ms) {
        const h = window.setTimeout(() => {
            this.timers = this.timers.filter((x) => x !== h);
            if (!this.disposed)
                fn();
        }, ms);
        this.timers.push(h);
    }
    toast(msg) {
        const t = this.q("#toast");
        t.textContent = msg;
        t.hidden = false;
        clearTimeout(t._h);
        t._h = setTimeout(() => (t.hidden = true), 3500);
    }
    // ---------- sheets ----------
    openSheet(kind, html, focusSel, reopen) {
        if (!this.sheetOpen)
            this.lastFocus = document.activeElement;
        // story sheets replace whatever was open (a stale Settings sheet must not reappear later)
        if (kind === "result" || kind === "intro" || kind === "ending")
            this.sheetStack = [];
        const top = this.sheetStack[this.sheetStack.length - 1];
        if (top && top.kind === kind)
            top.reopen = reopen;
        else
            this.sheetStack.push({ kind, reopen });
        this.sheetOpen = kind;
        this.setInert(true);
        const wrap = this.q("#sheet-wrap"), sheet = this.q("#sheet");
        sheet.className = "sheet sheet-" + kind;
        sheet.innerHTML = html;
        wrap.hidden = false;
        this.onSheet?.(true);
        const f = (focusSel && sheet.querySelector(focusSel));
        (f || sheet).focus();
    }
    /** Close the top sheet; if another sheet was beneath it, show that one again. */
    closeSheet() {
        this.sheetStack.pop();
        const prev = this.sheetStack.pop();
        if (prev) {
            this.sheetOpen = null;
            prev.reopen();
            return;
        }
        this.sheetOpen = null;
        this.setInert(false);
        this.q("#sheet-wrap").hidden = true;
        this.onSheet?.(false);
        this.lastFocus?.focus?.();
    }
    /** While a sheet is open nothing else in the game can be reached. */
    setInert(on) {
        for (const el of Array.from(this.root.children)) {
            if (el.id === "sheet-wrap" || el.id === "toast")
                continue;
            el.inert = on;
        }
    }
    sheetButtons(sheet, map) {
        for (const [id, fn] of Object.entries(map))
            sheet.querySelector("#" + id)?.addEventListener("click", (e) => { e.preventDefault(); this.audio.unlock(); fn(); });
    }
    showIntro() {
        const v = this.c.view(), cfg = v.night;
        this.openSheet("intro", `<p class="tag">Call ${cfg.id} of ${this.c.nights.nights.length}</p><h2>${esc(cfg.title)}</h2>
      <p class="story">${esc(INTRO[cfg.id] ?? "")}</p>
      <p class="intel"><strong>What you know:</strong> ${esc(cfg.intel)}</p>
      <p class="sub">${cfg.budget} calls before the line dies. Listening and tracing each use one call. Turning the dial is free.</p>
      <div class="sheet-buttons"><button type="button" class="btn btn-ghost" id="hear">▶ Hear it read</button><button type="button" class="btn btn-primary" id="answer">${cfg.tutorial ? "Start the walkthrough" : "Answer the call"}</button></div>
      ${cfg.tutorial ? `<p class="sub skip-line"><button type="button" class="btn btn-ghost" id="skip">Skip the walkthrough</button> Play this first call freely, with no step-by-step guide.</p>` : ""}`, "#answer", () => this.showIntro());
        this.sheetButtons(this.q("#sheet"), {
            hear: () => void this.audio.voiceLine("intro_" + cfg.id, INTRO[cfg.id] ?? ""),
            skip: () => {
                this.skipped = true;
                this.q("#answer").click();
            },
            answer: () => {
                this.closeSheet();
                this.audio.stopVoice();
                this.audio.startAmbience();
                this.audio.ring();
                this.c.begin();
                this.q("#caption").innerHTML = `<p class="cap-line">The intercom shows her at both doors.</p><p class="cap-meta">${this.c.view().night.tutorial ? "Follow the Guide, one step at a time." : "Follow your goal in the Guide."}</p>`;
            },
        });
    }
    askTrace() {
        const n = this.c.state.night;
        if (this.c.phase !== "play" || n.result || n.callsLeft <= 0)
            return;
        if (this.skipTraceConfirm.has(n.nightId)) {
            this.c.call("trace");
            return;
        }
        this.openSheet("confirm", `<h2>Trace this call?</h2>
      <p>Tracing records which door this call comes through. You learn the door, but this call's line becomes a coin flip at every dial setting, so it tells you nothing about <em>who</em> is calling.</p>
      <p class="sub">Uses 1 call. The next call is a fresh call, untraced unless you trace it too.</p>
      <label class="check"><input type="checkbox" id="no-ask"> Don't ask again for this call</label>
      <div class="sheet-buttons"><button type="button" class="btn btn-trace" id="do-trace">Trace</button><button type="button" class="btn btn-ghost" id="cancel">Cancel</button></div>`, "#do-trace", () => this.askTrace());
        this.sheetButtons(this.q("#sheet"), {
            "do-trace": () => {
                if (this.q("#no-ask").checked)
                    this.skipTraceConfirm.add(n.nightId);
                this.closeSheet();
                this.c.call("trace");
            },
            cancel: () => this.closeSheet(),
        });
    }
    askDecide(choice) {
        if (this.c.phase !== "play" || this.c.state.night.result)
            return;
        const what = choice === "hangup" ? "Hang up and keep both doors locked?" : `Open the ${choice} door?`;
        this.openSheet("confirm", `<h2>${what}</h2><p class="sub">This ends the call. It can't be undone.</p>
      <div class="sheet-buttons"><button type="button" class="btn ${choice === "hangup" ? "btn-hang" : "btn-door"}" id="yes">${choice === "hangup" ? "Hang up" : "Open it"}</button><button type="button" class="btn btn-ghost" id="cancel">Cancel</button></div>`, "#cancel", () => this.askDecide(choice));
        this.sheetButtons(this.q("#sheet"), {
            yes: () => { this.closeSheet(); this.c.decide(choice); },
            cancel: () => this.closeSheet(),
        });
    }
    showResult(res) {
        const v = this.c.view(), n = v.state, cfg = v.night, rev = v.revealed;
        const plan = this.c.state.plan[this.c.state.index];
        const door = correctDoor(plan);
        const pf = Math.cos((plan.alphaDeg * Math.PI) / 360) ** 2;
        const lean = door === "either" ? "evenly between both doors" : `toward the ${door} door (${pct(Math.max(pf, 1 - pf))} of traces would land there)`;
        const good = res === "saved" || res === "refused";
        const listens = n.log.filter((r) => r.kind === "listen").length, traces = n.log.length - listens;
        const info = dialInformation(this.c.nights, cfg, plan.alphaDeg);
        const best = info.map((x, k) => [x, k]).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, k]) => k).sort((a, b) => a - b);
        this.openSheet("result", `<p class="tag ${good ? "good" : "bad"}">${good ? "You chose right" : res === "letIn" ? "It's inside" : "Not quite"}</p>
      <h2>${rev.caller === "sister" ? "It was Mira." : "It wasn't Mira."}</h2>
      <p class="story">${esc(resultText(res))}</p>
      <ul class="facts">
        <li>The call leaned ${lean}.</li>
        ${rev.caller === "mimic" ? `<li>Its line ran ${cfg.mimicPhaseDeg}° out of step with Mira's.</li>` : ""}
        <li>You listened ${listens}× and traced ${traces}×, with ${n.callsLeft} call${n.callsLeft === 1 ? "" : "s"} to spare. ${cfg.id > 1 ? `The most telling dial settings tonight were ${best.join(" and ")}.` : ""}</li>
        ${good ? "" : `<li class="advice"><strong>What went wrong, and a better plan:</strong> ${lossAdvice(res, posteriorSister(this.c.nights, cfg, this.c.meterAlphaDeg(), n.log), listens, doorTally(n.log).front, doorTally(n.log).side, best, door)}</li>`}
        <li>Points: <strong>${n.points >= 0 ? "+" : ""}${n.points}</strong></li>
      </ul>
      <div class="sheet-buttons"><button type="button" class="btn btn-primary" id="next">${this.c.state.index + 1 >= this.c.nights.nights.length ? "See how the night ends" : "Next call"}</button></div>`, "#next", () => this.showResult(res));
        this.sheetButtons(this.q("#sheet"), { next: () => { this.closeSheet(); this.c.next(); } });
    }
    showEnding() {
        const s = this.c.state;
        const results = s.history.map((h) => h.result);
        const end = endingText(results);
        const rows = s.history.map((h, i) => {
            const p = s.plan[i], cfg = s.nights.nights[i];
            return `<tr><td>${cfg.id}. ${esc(cfg.title)}</td><td>${p.caller === "sister" ? "Mira" : "Mimic"}</td><td>${h.decision === "hangup" ? "Hung up" : "Opened " + h.decision}</td><td>${h.points >= 0 ? "+" : ""}${h.points}</td></tr>`;
        }).join("");
        this.openSheet("ending", `<p class="tag">The night is over</p><h2>${esc(end.title)}</h2><p class="story">${esc(end.text)}</p>
      <table class="score-table"><thead><tr><th scope="col">Call</th><th scope="col">Caller</th><th scope="col">You</th><th scope="col">Points</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><th scope="row" colspan="3">Total</th><td><strong>${s.score}</strong></td></tr></tfoot></table>
      <p class="sub">Outcomes came from: ${esc(this.c.sourceLabel)}.</p>
      <div class="sheet-buttons">${this.onBonus ? `<button type="button" class="btn btn-trace" id="bonus">Bonus: The Eraser</button>` : ""}<button type="button" class="btn btn-primary" id="again">Play again</button><button type="button" class="btn btn-ghost" id="how2">How it works</button><button type="button" class="btn btn-ghost" id="exit2">Exit</button></div>`, "#again", () => this.showEnding());
        this.sheetButtons(this.q("#sheet"), { again: () => this.onRestart?.(), how2: () => this.showHow(), exit2: () => this.onExit?.(), bonus: () => this.onBonus?.() });
        this.audio.stopAmbience();
    }
    showHow() {
        this.openSheet("how", `<h2>How it works</h2>
      <p><strong>One call, two entrances.</strong> The call is a single qubit. Its two basis states are the two doors. Mira's call is in a superposition of both: not "at one door and we don't know which", but at both in a way that can interfere.</p>
      <p><strong>Listen</strong> recombines the two door channels at the handset (a Hadamard gate) and measures. Whether they add up (clear line) or cancel (static) depends on the phase between them: the caller's hidden phase θ minus your dial φ.</p>
      <p class="formula">P(clear) = ½ · (1 + sin α · cos(θ − φ))</p>
      <p>Mira's phase is 0. The thing that isn't Mira is out of step by a known amount, so the pattern of clear and static across dial settings tells you who is calling. One listen is one fresh call, so you need several, and the most telling dials are not always Mira's own.</p>
      <p><strong>Trace</strong> copies "which door" onto a second qubit before recombining (a CNOT). You learn the door, but the which-door record destroys the interference: P(clear) becomes ½ at every dial, for Mira and the mimic alike. Finding <em>where</em> she is costs you the evidence of <em>who</em> she is.</p>
      <p><strong>The lean α</strong> sets how the call splits between doors: a trace finds the front door with probability cos²(α/2). Listening is blind to which door the call leans toward, so you must trace to choose the right door.</p>
      <pre class="circuit">q0 (doors): ─ Ry(α) ─ P(θ) ─ P(−φ) ─●─ H ─ M   → clear / static
                                         │
q1 (trace record):  ─────────────────────X─────── M   → front / side   (trace only)</pre>
      <p class="sub"><strong>Honesty notes.</strong> The doors, figures and voices are fiction; the circuit never processes audio. Each outcome only picks which prepared line is shown. Outcomes in this game come from: ${esc(this.c.sourceLabel)}. When a Qollab run succeeds, the game replays shots from the backend you chose, one shot per call, each used once. A classical computer can simulate this small circuit; the point is the rule it teaches: coherent alternatives interfere, and recording which path destroys that.</p>
      <p class="sub"><strong>Credits.</strong> Voices: Piper TTS (MIT) with a voice trained on the LibriTTS corpus (Zen et al., CC BY 4.0). Art, sound effects and story: made for this game. This effort is supported by Qollab &amp; IonQ.</p>
      <div class="sheet-buttons"><button type="button" class="btn btn-primary" id="close">Close</button></div>`, "#close", () => this.showHow());
        this.sheetButtons(this.q("#sheet"), {
            close: () => this.closeSheet(),
        });
    }
    showSettings() {
        const s = this.c.settings;
        const row = (id, label, on) => `<label class="check"><input type="checkbox" id="${id}" ${on ? "checked" : ""}> ${label}</label>`;
        this.openSheet("settings", `<h2>Settings</h2>
      ${row("set-voice", "Voices (recorded neural TTS)", s.voice)}
      ${row("set-sound", "Sound effects and ambience", s.sound)}
      ${row("set-gentle", "Gentle mode (no loud stingers)", s.gentle)}
      ${row("set-meter", "WHO meter", s.meter)}
      ${row("set-motion", "Reduce motion and flicker", s.reducedMotion)}
      <p class="sub">Captions are always on.</p>
      <div class="sheet-buttons"><button type="button" class="btn btn-primary" id="close">Done</button></div>`, "#close", () => this.showSettings());
        const sheet = this.q("#sheet");
        const bindBox = (id, fn) => sheet.querySelector("#" + id).addEventListener("change", (e) => fn(e.target.checked));
        bindBox("set-voice", (v) => { s.voice = v; this.audio.voice = v; if (!v)
            this.audio.stopVoice(); });
        bindBox("set-sound", (v) => { s.sound = v; this.audio.sound = v; if (!v)
            this.audio.stopAmbience();
        else if (this.c.phase === "play")
            this.audio.startAmbience(); });
        bindBox("set-gentle", (v) => { s.gentle = v; this.audio.gentle = v; });
        bindBox("set-meter", (v) => { s.meter = v; this.render(); });
        bindBox("set-motion", (v) => { s.reducedMotion = v; this.root.classList.toggle("reduced", v); });
        this.sheetButtons(sheet, { close: () => this.closeSheet() });
    }
    dispose() {
        this.disposed = true;
        clearInterval(this.idleTimer);
        for (const h of this.timers)
            clearTimeout(h);
        this.timers = [];
        this.off();
        document.removeEventListener("keydown", this.onKey);
        this.feed?.dispose();
        this.root.remove();
    }
}
