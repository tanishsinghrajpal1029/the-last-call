/**
 * DOM interface shared by every mode: on-screen ("screen"), WebXR overlay
 * ("xr") and marker AR overlay ("marker"). Captions always carry the full
 * content of every spoken line and sound cue.
 */
import { posteriorSister, doorTally, dialInformation } from "../../../packages/core/src/evidence.js";
import { resultText } from "../../../packages/core/src/game.js";
import { endingText, INTRO } from "../../../packages/core/src/lines.js";
import { correctDoor } from "../../../packages/core/src/nights.js";
import { evidenceChart } from "./chart.js";
import { Feed } from "./feed.js";
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
    lastFocus = null;
    onExit = null;
    onRestart = null;
    onReposition = null;
    /** AR views may need to show/hide their own placement UI; called when the sheet state changes. */
    onSheet = null;
    constructor(parent, c, mode, audio) {
        this.c = c;
        this.mode = mode;
        this.audio = audio;
        this.root = document.createElement("div");
        this.root.className = "ui ui-" + mode;
        parent.appendChild(this.root);
        this.root.innerHTML = this.skeleton();
        if (mode === "screen")
            this.feed = new Feed(this.q("#feed-slot"), c);
        this.bind();
        this.off = c.on((e) => {
            if (e.type === "call")
                this.onCall(e.record);
            if (e.type === "result")
                this.onResult(e.result);
            if (e.type === "error")
                this.toast(e.message);
            if (e.type === "night")
                this.showIntro();
            if (e.type === "over")
                this.showEnding();
            if (e.type === "state")
                this.render();
        });
        this.render();
        this.showIntro();
    }
    q(sel) {
        return this.root.querySelector(sel);
    }
    skeleton() {
        const compact = this.mode !== "screen";
        return `
      <header class="top">
        <span class="chip" id="night-chip"></span>
        <span class="chip" id="calls-chip" aria-live="polite"></span>
        <span class="chip" id="score-chip"></span>
        <span class="top-buttons">
          ${this.mode === "xr" ? `<button type="button" class="btn btn-ghost" id="move-btn">Move house</button>` : ""}
          <button type="button" class="btn btn-ghost" id="how-btn">How it works</button>
          <button type="button" class="btn btn-ghost" id="settings-btn">Settings</button>
          <button type="button" class="btn btn-ghost" id="exit-btn">Exit</button>
        </span>
      </header>
      ${compact ? "" : `<div id="feed-slot" class="feed-slot"></div>`}
      <div class="caption" id="caption" aria-live="polite" aria-atomic="true"><p class="cap-line">…</p><p class="cap-meta"></p></div>
      <p class="coach" id="coach" aria-live="polite" hidden></p>
      <section class="controls" aria-label="Intercom controls">
        <div class="dial-row">
          <button type="button" class="btn btn-round" id="dial-down" aria-label="Turn dial left">◀</button>
          <div class="dial" id="dial" role="slider" tabindex="0" aria-label="Phase dial" aria-valuemin="0" aria-valuemax="7"></div>
          <button type="button" class="btn btn-round" id="dial-up" aria-label="Turn dial right">▶</button>
          <div class="dial-label" id="dial-label"></div>
        </div>
        <div class="call-row">
          <button type="button" class="btn btn-primary" id="listen-btn">Listen <span class="sub">both doors together</span></button>
          <button type="button" class="btn btn-trace" id="trace-btn">Trace <span class="sub">find the door, lose the interference</span></button>
        </div>
        <div class="decide-row">
          <button type="button" class="btn btn-door" id="open-front">Open front door</button>
          <button type="button" class="btn btn-door" id="open-side">Open side door</button>
          <button type="button" class="btn btn-hang" id="hangup">Hang up</button>
        </div>
      </section>
      <section class="evidence" id="evidence" aria-label="Evidence">
        ${compact ? `<details id="ev-details"><summary>Evidence</summary>` : `<h2 class="ev-h">Evidence</h2>`}
        <div class="meter" id="meter"></div>
        <p class="doors" id="doors"></p>
        <div id="chart"></div>
        <ol class="log" id="log" reversed></ol>
        ${compact ? `</details>` : ""}
      </section>
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
        click("dial-down", () => { c.setDial(c.state.night.dial - 1); this.audio.dial(); });
        click("dial-up", () => { c.setDial(c.state.night.dial + 1); this.audio.dial(); });
        click("listen-btn", () => c.call("listen"));
        click("trace-btn", () => this.askTrace());
        click("open-front", () => this.askDecide("front"));
        click("open-side", () => this.askDecide("side"));
        click("hangup", () => this.askDecide("hangup"));
        click("how-btn", () => this.showHow());
        if (this.mode === "xr")
            click("move-btn", () => this.onReposition?.());
        click("settings-btn", () => this.showSettings());
        click("exit-btn", () => this.onExit?.());
        const dial = this.q("#dial");
        dial.addEventListener("keydown", (e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                c.setDial(c.state.night.dial - 1);
                this.audio.dial();
                e.preventDefault();
            }
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                c.setDial(c.state.night.dial + 1);
                this.audio.dial();
                e.preventDefault();
            }
        });
        dial.addEventListener("click", (e) => {
            const t = e.target.closest("[data-k]");
            if (t) {
                this.audio.unlock();
                c.setDial(Number(t.dataset.k));
                this.audio.dial();
            }
        });
        if (this.mode === "screen")
            document.addEventListener("keydown", this.onKey);
    }
    onKey = (e) => {
        if (this.sheetOpen) {
            if (e.key === "Escape" && (this.sheetOpen === "how" || this.sheetOpen === "settings" || this.sheetOpen === "confirm"))
                this.closeSheet();
            return;
        }
        const tag = e.target?.tagName;
        if (tag === "INPUT" || tag === "BUTTON" && (e.key === " " || e.key === "Enter"))
            return;
        const k = e.key.toLowerCase();
        if (k === "l") {
            this.audio.unlock();
            this.c.call("listen");
        }
        else if (k === "t") {
            this.audio.unlock();
            this.askTrace();
        }
        else if (e.key === "ArrowLeft") {
            this.c.setDial(this.c.state.night.dial - 1);
            this.audio.dial();
        }
        else if (e.key === "ArrowRight") {
            this.c.setDial(this.c.state.night.dial + 1);
            this.audio.dial();
        }
    };
    // ---------- rendering ----------
    render() {
        const c = this.c, v = c.view(), n = v.state, cfg = v.night, f = c.nights;
        this.q("#night-chip").textContent = `Call ${cfg.id} of ${f.nights.length} · ${cfg.title}`;
        this.q("#calls-chip").innerHTML = `Calls left <span class="pips" aria-label="${n.callsLeft} of ${n.budget}">${"●".repeat(n.callsLeft)}${"○".repeat(n.budget - n.callsLeft)}</span>`;
        this.q("#score-chip").textContent = `Score ${v.score}`;
        const playing = c.phase === "play";
        const ended = !!n.result;
        for (const id of ["listen-btn", "trace-btn"])
            this.q("#" + id).disabled = !playing || ended || n.callsLeft <= 0;
        for (const id of ["open-front", "open-side", "hangup", "dial-down", "dial-up"])
            this.q("#" + id).disabled = !playing || ended;
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
        this.q("#dial-label").innerHTML = `Dial <strong>${n.dial}</strong><br><span class="sub">${(360 / steps) * n.dial}° shift on the side-door channel</span>`;
        // evidence
        const alpha = c.meterAlphaDeg();
        const t = doorTally(n.log);
        if (c.settings.meter) {
            const p = posteriorSister(f, cfg, alpha, n.log);
            this.q("#meter").innerHTML = `<div class="meter-label">Is it Mira? <strong>${pctMeter(p)}</strong> <span class="sub">(from your listens; traces don't move it)</span></div>
        <div class="meter-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(100 * p)}" aria-label="Chance it is Mira"><span style="width:${(100 * p).toFixed(1)}%"></span></div>`;
        }
        else
            this.q("#meter").innerHTML = `<p class="sub">Evidence meter is off (Settings).</p>`;
        this.q("#doors").innerHTML = `Traces: front door <strong>${t.front}</strong> · side door <strong>${t.side}</strong>`;
        this.q("#chart").innerHTML = evidenceChart(f, cfg, alpha, n.log, n.dial);
        this.q("#log").innerHTML = n.log.slice().reverse().map((r) => `<li><span class="lg-kind ${r.kind}">${r.kind === "trace" ? "Trace" : "Listen"}</span> dial ${r.dial} → <strong>${r.line}</strong>${r.door ? ` · ${r.door} door` : ""} <span class="lg-text">“${esc(r.text)}”</span></li>`).join("");
        this.renderCoach();
    }
    renderCoach() {
        const c = this.c, n = c.state.night, cfg = c.view().night, el = this.q("#coach");
        const hl = (id) => {
            for (const b of this.root.querySelectorAll(".hl"))
                b.classList.remove("hl");
            if (id)
                this.q("#" + id).classList.add("hl");
        };
        if (!cfg.tutorial || c.phase !== "play" || n.result) {
            el.hidden = true;
            hl(null);
            return;
        }
        const listens = n.log.filter((r) => r.kind === "listen");
        const traced = n.log.some((r) => r.kind === "trace");
        let msg, target;
        if (!listens.length && !traced) {
            [msg, target] = n.dial === 0 ? ["Mira's own setting is dial 0. Press Listen to hear the call through both doors at once.", "listen-btn"] : ["Turn the dial back to 0, Mira's setting, then Listen.", "dial"];
        }
        else if (!listens.some((r) => r.dial === 4)) {
            [msg, target] = n.dial !== 4 ? ["Now turn the dial half a turn, to 4. It shifts the side-door channel by 180°.", "dial-up"] : ["Listen again at dial 4.", "listen-btn"];
        }
        else if (!traced) {
            [msg, target] = ["At 0 the two door channels added up (clear). At 4 they cancelled (static). That is interference, and it only happens because one call comes through both doors. Now press Trace.", "trace-btn"];
        }
        else {
            [msg, target] = ["Tracing told you which door this call came through, but a traced call is a coin flip at every dial: knowing the door destroyed the interference. Tonight she's balanced between both doors, so either door is right. Open one.", "open-front"];
        }
        el.hidden = false;
        el.textContent = msg;
        hl(target);
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
        this.audio.lineOpen();
        const speak = () => (r.line === "clear" ? this.audio.say(r.text) : this.audio.staticBurst());
        if (r.kind === "trace") {
            this.audio.traceBeeps();
            setTimeout(speak, 750);
        }
        else
            setTimeout(speak, 200);
        if (this.c.state.night.callsLeft === 0)
            this.toast("That was the last call. Open a door or hang up.");
    }
    onResult(res) {
        const a = this.audio;
        if (res === "letIn") {
            a.door();
            setTimeout(() => { a.stinger(); a.say("Thank you.", true); }, 900);
        }
        else if (res === "refused") {
            setTimeout(() => a.say("Next time.", true), 400);
        }
        else if (res === "saved") {
            a.door();
            setTimeout(() => { a.relief(); a.say("Took you long enough."); }, 900);
        }
        else if (res === "wrongDoor") {
            a.door();
            setTimeout(() => a.say("Wrong one."), 900);
        }
        setTimeout(() => this.showResult(res), res === "letIn" && !this.c.settings.gentle ? 2600 : 1400);
    }
    toast(msg) {
        const t = this.q("#toast");
        t.textContent = msg;
        t.hidden = false;
        clearTimeout(t._h);
        t._h = setTimeout(() => (t.hidden = true), 3500);
    }
    // ---------- sheets ----------
    openSheet(kind, html, focusSel) {
        this.lastFocus = document.activeElement;
        this.sheetOpen = kind;
        const wrap = this.q("#sheet-wrap"), sheet = this.q("#sheet");
        sheet.className = "sheet sheet-" + kind;
        sheet.innerHTML = html;
        wrap.hidden = false;
        this.onSheet?.(true);
        const f = (focusSel && sheet.querySelector(focusSel));
        (f || sheet).focus();
    }
    closeSheet() {
        this.sheetOpen = null;
        this.q("#sheet-wrap").hidden = true;
        this.onSheet?.(false);
        this.lastFocus?.focus?.();
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
      <div class="sheet-buttons"><button type="button" class="btn btn-primary" id="answer">Answer the call</button></div>`, "#answer");
        this.sheetButtons(this.q("#sheet"), {
            answer: () => {
                this.closeSheet();
                this.audio.startAmbience();
                this.audio.ring();
                this.c.begin();
                this.q("#caption").innerHTML = `<p class="cap-line">The intercom shows her at both doors.</p><p class="cap-meta">Choose a dial setting, then Listen or Trace.</p>`;
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
      <div class="sheet-buttons"><button type="button" class="btn btn-trace" id="do-trace">Trace</button><button type="button" class="btn btn-ghost" id="cancel">Cancel</button></div>`, "#do-trace");
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
      <div class="sheet-buttons"><button type="button" class="btn ${choice === "hangup" ? "btn-hang" : "btn-door"}" id="yes">${choice === "hangup" ? "Hang up" : "Open it"}</button><button type="button" class="btn btn-ghost" id="cancel">Cancel</button></div>`, "#cancel");
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
        <li>Points: <strong>${n.points >= 0 ? "+" : ""}${n.points}</strong></li>
      </ul>
      <div class="sheet-buttons"><button type="button" class="btn btn-primary" id="next">${this.c.state.index + 1 >= this.c.nights.nights.length ? "See how the night ends" : "Next call"}</button></div>`, "#next");
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
      <div class="sheet-buttons"><button type="button" class="btn btn-primary" id="again">Play again</button><button type="button" class="btn btn-ghost" id="how2">How it works</button><button type="button" class="btn btn-ghost" id="exit2">Exit</button></div>`, "#again");
        this.sheetButtons(this.q("#sheet"), { again: () => this.onRestart?.(), how2: () => this.showHow(), exit2: () => this.onExit?.() });
        this.audio.stopAmbience();
    }
    showHow() {
        const back = this.sheetOpen && this.sheetOpen !== "how" ? this.sheetOpen : null;
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
      <p class="sub"><strong>Honesty notes.</strong> The doors, figures and voices are fiction; the circuit never processes audio. Each outcome only picks which prepared line is shown. Outcomes in this app come from: ${esc(this.c.sourceLabel)}. On Qollab, the game replays fresh shots measured on the backend you chose, one shot per call, each used once. A classical computer can simulate this small circuit; the point is the rule it teaches: coherent alternatives interfere, and recording which path destroys that.</p>
      <div class="sheet-buttons"><button type="button" class="btn btn-primary" id="close">Close</button></div>`, "#close");
        this.sheetButtons(this.q("#sheet"), {
            close: () => {
                if (back === "ending")
                    this.showEnding();
                else if (back === "intro")
                    this.showIntro();
                else
                    this.closeSheet();
            },
        });
    }
    showSettings() {
        const s = this.c.settings;
        const row = (id, label, on) => `<label class="check"><input type="checkbox" id="${id}" ${on ? "checked" : ""}> ${label}</label>`;
        this.openSheet("settings", `<h2>Settings</h2>
      ${row("set-voice", "Spoken voice (device text-to-speech)", s.voice)}
      ${row("set-sound", "Sound effects and ambience", s.sound)}
      ${row("set-gentle", "Gentle mode (no loud stingers)", s.gentle)}
      ${row("set-meter", "Evidence meter", s.meter)}
      ${row("set-motion", "Reduce motion and flicker", s.reducedMotion)}
      <p class="sub">Captions are always on.</p>
      <div class="sheet-buttons"><button type="button" class="btn btn-primary" id="close">Done</button></div>`, "#close");
        const sheet = this.q("#sheet");
        const bindBox = (id, fn) => sheet.querySelector("#" + id).addEventListener("change", (e) => fn(e.target.checked));
        bindBox("set-voice", (v) => { s.voice = v; this.audio.voice = v; });
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
        this.off();
        document.removeEventListener("keydown", this.onKey);
        this.feed?.dispose();
        this.root.remove();
    }
}
