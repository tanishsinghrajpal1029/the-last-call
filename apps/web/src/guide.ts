/**
 * The Guide: a staged walkthrough for the first call, and a goal checklist for
 * the others. Each stage says what to do, what it means in the game, and what
 * it means in quantum terms. Stages gate the controls so a new player is never
 * lost.
 */

import { CallRecord } from "../../../packages/core/src/game.js";
import { NightConfig } from "../../../packages/core/src/nights.js";

export type Action = "dial" | "listen" | "trace" | "front" | "side" | "hangup";

export interface Stage {
  id: string;
  short: string;
  title: string;
  /** what the player should do now (plain language) */
  doThis: string;
  /** what it means in the game */
  body: string;
  /** what it means in quantum terms */
  quantum: string;
  /** voice clip id for the narrator */
  voice: string;
  /** controls enabled at this stage */
  allow: Action[];
  /** a "Next" button instead of an action completes the stage */
  next?: boolean;
  /** stage is complete when this returns true (for action stages) */
  done?: (log: CallRecord[], dial: number) => boolean;
  /** the one call that completes this stage */
  needs?: { kind: "listen" | "trace"; dial?: number };
  /** element to highlight */
  target?: (dial: number) => string;
}

export const STAGES: Stage[] = [
  {
    id: "goal", short: "Goal", title: "How to win", voice: "stage_goal", allow: [], next: true,
    doThis: "Read this, then press Next.",
    body: "Each call, something that sounds like your little sister Mira wants to come in. Before the line dies you must answer two questions: <strong>WHO</strong> is calling (Mira, or the thing copying her voice?) and <strong>WHERE</strong> she is (front door or side door?). Then open the right door for Mira, or hang up on the impostor.",
    quantum: "The call is a <em>qubit</em>: a quantum bit. Its two states are the two doors.",
  },
  {
    id: "superposition", short: "Two doors", title: "One call, two doors", voice: "stage_superposition", allow: [], next: true,
    doThis: "Look at both cameras, then press Next.",
    body: "The same figure stands at both doors. It isn't that she's at one door and you don't know which: the call really is at both doors at once, and the two halves can still affect each other.",
    quantum: "<strong>Superposition.</strong> The qubit is in |front⟩ + |side⟩ together, like a wave passing through two openings at once.",
  },
  {
    id: "listen", short: "Listen", title: "Listen", voice: "stage_listen", allow: ["dial", "listen"],
    doThis: "Keep the dial at <strong>0</strong> and press <strong>Listen</strong>.",
    body: "Listening joins the voice from both doors at your handset. You'll hear either her clear voice or static.",
    quantum: "Listen = recombine the two halves (a <em>Hadamard gate</em>) and measure. Each listen is one fresh call: one shot.",
    done: (log) => log.some((r) => r.kind === "listen" && r.dial === 0),
    needs: { kind: "listen", dial: 0 },
    target: (dial) => (dial === 0 ? "listen-btn" : "dial"),
  },
  {
    id: "interference", short: "Dial", title: "Turn the dial", voice: "stage_interference", allow: ["dial", "listen"],
    doThis: "Turn the dial to <strong>4</strong> (half a turn) and press <strong>Listen</strong> again.",
    body: "The dial delays the side door's half of the call. At 0 the two halves arrive in step and add up: a clear line. Half a turn later they arrive out of step and cancel: static.",
    quantum: "<strong>Interference.</strong> The dial sets a phase. In step: the amplitudes add (constructive). Out of step: they cancel (destructive). One door alone could never cancel itself; this only happens because the call is at both.",
    done: (log) => log.some((r) => r.kind === "listen" && r.dial === 4),
    needs: { kind: "listen", dial: 4 },
    target: (dial) => (dial === 4 ? "listen-btn" : "dial-up"),
  },
  {
    id: "impostor", short: "Voiceprint", title: "The voiceprint", voice: "stage_impostor", allow: ["dial", "listen"], next: true,
    doThis: "Look at the Voiceprint chart. Listen at another dial setting if you like, then press Next.",
    body: "Where the line comes through clear, and where it turns to static, is the caller's <strong>voiceprint</strong>. Mira's (solid line) is clear at 0 and static at 4. The impostor's (dashed) is the same shape, shifted. Your listens are the dots: whichever line they follow is who's calling.",
    quantum: "The impostor carries a different hidden phase θ. P(clear) = ½(1 + cos(θ − dial)). Same physics, shifted pattern. One shot is random, so a few listens make it clear.",
  },
  {
    id: "trace", short: "Trace", title: "Trace the call", voice: "stage_trace", allow: ["trace"],
    doThis: "Press <strong>Trace</strong>.",
    body: "Tracing tells you which door this call came through. But watch the WHO meter: it won't move. A traced call is a coin flip between clear and static at every dial, whoever is calling.",
    quantum: "<strong>Measurement destroys interference.</strong> Trace copies “which door” onto a second qubit (a <em>CNOT</em>). Once the path is recorded, the two halves can't interfere. Knowing WHERE costs you the evidence of WHO.",
    done: (log) => log.some((r) => r.kind === "trace"),
    needs: { kind: "trace" },
    target: () => "trace-btn",
  },
  {
    id: "decide", short: "Decide", title: "Decide", voice: "stage_decide", allow: ["dial", "listen", "trace", "front", "side", "hangup"],
    doThis: "Tonight Mira stands evenly at both doors, so either door is right. <strong>Open a door.</strong>",
    body: "From the next call on, the caller may be the impostor, and the call will lean toward one door. You'll need both tools, and only a few calls.",
    quantum: "Every listen or trace prepares a new qubit and measures it once. Your evidence is a handful of random outcomes, so spend your calls where they tell you most.",
    target: () => "open-front",
  },
];

export function guideForCase(cfg: NightConfig, leans: boolean): string {
  return `<ol class="goal-list">
    <li><strong>WHO is calling?</strong> Listen at a few dial settings until the WHO meter is sure. <span class="sub">Tip: listen where the two voiceprint lines are furthest apart. If it isn't Mira, its voiceprint is shifted by <strong>${cfg.mimicPhaseDeg}°</strong> (${cfg.mimicPhaseDeg / 45} dial steps).</span></li>
    <li><strong>WHERE is she?</strong> ${leans ? "The call leans toward one door. Trace it a few times (an odd number breaks ties)." : "Tonight she's balanced between both doors, so either door is right. No need to trace."}</li>
    <li><strong>DECIDE.</strong> Mira → open the door she leans toward. Impostor → hang up.</li>
  </ol>`;
}

/** Plain-language + quantum explanation of the call that just happened. */
export function explainCall(r: CallRecord, sisterClear: number, mimicClear: number): { game: string; quantum: string } {
  const p = (x: number) => (x > 0.99 ? "over 99%" : x < 0.01 ? "under 1%" : Math.round(100 * x) + "%");
  if (r.kind === "trace") {
    return {
      game: `Traced: the call came through the <strong>${r.door} door</strong>. The line was ${r.line}, but after a trace that's a coin flip, so it says nothing about who is calling.`,
      quantum: "The CNOT recorded the path, so the two halves could not interfere. The outcome was 50/50 at this dial, for Mira and the impostor alike.",
    };
  }
  const pMira = r.line === "clear" ? sisterClear : 1 - sisterClear, pImp = r.line === "clear" ? mimicClear : 1 - mimicClear;
  const rare = Math.max(pMira, pImp) < 0.1 ? " That result is rare for either caller: a noisy shot. Listen again." : "";
  return {
    game: `Listened at dial ${r.dial}: <strong>${r.line === "clear" ? "clear line" : "static"}</strong>. At this setting Mira comes through clear ${p(sisterClear)} of the time; the impostor ${p(mimicClear)}.${rare}`,
    quantum: `The two door halves were recombined and measured once. ${Math.abs(sisterClear - mimicClear) < 0.15 ? "Here both voiceprints predict almost the same thing, so this listen told you little. Try a dial where the lines are far apart." : "The voiceprints differ a lot here, so this listen was good evidence."}`,
  };
}
