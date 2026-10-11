/**
 * The Guide: a staged walkthrough for the first call, and a goal checklist for
 * the others. Each stage says what to do, what it means in the game, and what
 * it means in quantum terms. Stages gate the controls so a new player is never
 * lost.
 */

import { CallRecord } from "../../../packages/core/src/game.js";
import { NightConfig } from "../../../packages/core/src/nights.js";

export type Action = "dial" | "listen" | "trace" | "erase" | "front" | "side" | "hangup";

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

/** The whole game in one sentence (also spoken by the narrator). */
export const GOAL = "Someone is outside. Use the intercom to find out who it is and which door, then let Mira in through the right door, or hang up on the mimic.";

export const STAGES: Stage[] = [
  {
    id: "goal", short: "Goal", title: "How to win", voice: "stage_goal", allow: [], next: true,
    doThis: "Read this, then press Next.",
    body: "<strong class=\"goal-line\">" + GOAL + "</strong> Two questions every call: <strong>WHO</strong> is calling (Mira, or the thing copying her voice?) and <strong>WHERE</strong> is she (front door or side door?). <strong>Listen</strong> answers who. <strong>Trace</strong> answers where. Then decide before the line dies.",
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

/** The WHO / WHERE / DECIDE checklist for this call, from its tools. No strategy is given away here (see hintFor). */
export function guideForCase(cfg: NightConfig, leans: boolean): string {
  const erase = !cfg.tools.includes("listen");
  const who = erase
    ? `<strong>WHO is calling?</strong> Every call is recorded tonight, so a plain line is a coin flip. <strong>Erase</strong> at a few dial settings, then <strong>sort</strong> the erased calls by what the eraser read (+ / −): the voiceprint comes back in two mirror-image halves. <span class="sub">If it isn't Mira, its voiceprint is shifted by <strong>${cfg.mimicPhaseDeg}°</strong> (${cfg.mimicPhaseDeg / 45} dial steps).</span>`
    : `<strong>WHO is calling?</strong> Listen at a few dial settings and compare your dots with the two voiceprints. <span class="sub">If it isn't Mira, its voiceprint is shifted by <strong>${cfg.mimicPhaseDeg}°</strong> (${cfg.mimicPhaseDeg / 45} dial steps).</span>`;
  const where = !leans
    ? "Tonight she's balanced between both doors, so either door is right."
    : cfg.tools.includes("trace") ? "The call leans toward one door. Trace to find out which (a lean is a probability, so one trace can mislead)." : "The call leans toward one door.";
  return `<ol class="goal-list">
    <li>${who}</li>
    <li><strong>WHERE is she?</strong> ${where}</li>
    <li><strong>DECIDE.</strong> Mira → open the door she leans toward. Impostor → hang up.</li>
  </ol>`;
}

/** The optional hint: where the evidence per call is strongest (asked for, never shown by default). */
export function hintFor(cfg: NightConfig, bestDials: number[], who: "listen" | "erase"): string {
  const verb = who === "erase" ? "Erase" : "Listen";
  return `<strong>Hint:</strong> ${verb} where the two voiceprint lines are furthest apart. Tonight that is dial <strong>${bestDials.join(" or ")}</strong>, not necessarily Mira's own dial 0.` +
    (cfg.tools.includes("trace") && cfg.alphaChoicesDeg.some((a) => a !== 90) ? " For the door, an odd number of traces avoids a tie." : "");
}

/** Plain-language + quantum explanation of the call that just happened. */
export function explainCall(r: CallRecord, sisterClear: number, mimicClear: number): { game: string; quantum: string } {
  const p = (x: number) => (x > 0.99 ? "over 99%" : x < 0.01 ? "under 1%" : Math.round(100 * x) + "%");
  if (r.kind === "erase") {
    const grp = r.sign === "plus" ? "+" : "−";
    const sc = r.sign === "plus" ? sisterClear : 1 - sisterClear, mc = r.sign === "plus" ? mimicClear : 1 - mimicClear;
    return {
      game: `Erased at dial ${r.dial}: the eraser read <strong>${grp}</strong>, line <strong>${r.line}</strong>. On its own that is a coin flip. Sorted into the ${grp} group, Mira comes through clear ${p(sc)} of the time here; the impostor ${p(mc)}.`,
      quantum: "The door was recorded on a second qubit, then that record was read in the X basis, which carries no door information. Conditioned on + the line shows Mira's full fringe; on −, the opposite fringe; both together are flat. Nothing was undone: the pattern exists only in the sorted data.",
    };
  }
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

/**
 * Walkthrough only: the narrator reacts to the result the player actually got.
 * Texts must match shared/voice_lines.json (checked by the core tests).
 */
export const TUT_REACT: Record<string, string> = {
  tut_listen_clear: "Clear. Her voice came through both doors in step, and the two halves added up.",
  tut_listen_static: "Static. At dial zero that's rare: one noisy shot. Each call is random, so one listen is never the whole story.",
  tut_dial4_static: "Static. Half a turn out of step, the two halves cancel each other out.",
  tut_dial4_clear: "Clear, by chance. Out of step, she should mostly cancel. Patterns show up over several listens.",
  tut_trace: "The trace found the door. But now the line is a coin flip, whoever is calling. Knowing where cost you who.",
};

export function reactionFor(stageId: string, r: CallRecord): string | null {
  if (stageId === "listen" && r.kind === "listen" && r.dial === 0) return r.line === "clear" ? "tut_listen_clear" : "tut_listen_static";
  if (stageId === "interference" && r.kind === "listen" && r.dial === 4) return r.line === "static" ? "tut_dial4_static" : "tut_dial4_clear";
  if (stageId === "trace" && r.kind === "trace") return "tut_trace";
  return null;
}

/**
 * Heard through the door (not on the line) when the player hesitates. The same
 * pool for Mira and the mimic, chosen at random: never evidence.
 */
export const HESITATE: Record<string, string> = {
  door_hello: "Hello?",
  door_still: "Are you still there?",
  door_light: "I can see your light on.",
};

export interface Status { who: string; where: string; options: string[] }

/**
 * Plain-language state of the case: how sure the evidence is, never more sure
 * than it is. `pMira` is null when the WHO meter is switched off.
 */
export function caseStatus(pMira: number | null, whoCalls: number, front: number, side: number, leans: boolean, callsLeft: number, bestDials: number[] | null, kind: "listen" | "erase" = "listen", sorted = true): Status {
  let who: string;
  const noun = kind === "erase" ? "erased calls" : "listens";
  if (kind === "erase" && !sorted) who = whoCalls ? `WHO: ${whoCalls} erased call${whoCalls === 1 ? "" : "s"}, unsorted (a coin flip until sorted)` : "WHO: unknown, nothing erased yet";
  else if (pMira === null) who = "WHO: read the voiceprint chart";
  else if (!whoCalls) who = `WHO: unknown, no ${noun} yet`;
  else if (pMira > 0.97) who = "Almost certainly Mira";
  else if (pMira > 0.8) who = "Mira likely";
  else if (pMira >= 0.2) who = "Caller still unclear";
  else if (pMira >= 0.03) who = "Impostor likely";
  else who = "Almost certainly the impostor";
  let where: string;
  const margin = Math.abs(front - side), lead = front > side ? "front" : "side";
  if (!leans) where = "either door works tonight";
  else if (front + side === 0) where = "door unknown, no traces yet";
  else if (margin === 0) where = "door uncertain (traces tied)";
  else if (margin === 1) where = `leans ${lead}, but still uncertain`;
  else where = `leans ${lead}`;
  const options: string[] = [];
  if (callsLeft > 0) {
    const verb = kind === "erase" ? "Erase" : "Listen";
    options.push(`${verb}${bestDials ? ` (dial ${bestDials.join(" or ")} tells you most)` : ""} for more WHO evidence`);
    if (kind === "erase" && whoCalls && !sorted) options.push("Sort the erased calls");
    if (leans) options.push("Trace for more WHERE evidence");
  }
  options.push(callsLeft > 0 ? "Decide now" : "Decide: the line is dead");
  return { who, where, options };
}

/** After a wrong decision: what happened and a better plan for next time. */
export function lossAdvice(res: "letIn" | "abandoned" | "wrongDoor", pMira: number, whoCalls: number, front: number, side: number, bestDials: number[], leanDoor: string, kind: "listen" | "erase" = "listen"): string {
  const pc = (x: number) => (x > 0.99 ? "over 99%" : x < 0.01 ? "under 1%" : Math.round(100 * x) + "%");
  const dials = `dial ${bestDials.join(" or ")}`;
  const ing = kind === "erase" ? "erasing (and sorting)" : "listening", noun = kind === "erase" ? "sorted erased calls" : "listens";
  if (res === "letIn") {
    if (!whoCalls) return `You opened without ${ing}, so you had no evidence of who was calling. Next time, gather a few ${noun} first, at ${dials}, where the two voiceprints differ most.`;
    return pMira >= 0.5
      ? `Your ${noun} made Mira look ${pc(pMira)} likely: a hint, not proof. Random shots can mislead you. Next time, spend more calls ${ing} at ${dials} until the meter is near the end before you open.`
      : `Your evidence already favoured the impostor (Mira only ${pc(pMira)}) when you opened. When the WHO meter leans to the impostor, hang up.`;
  }
  if (res === "abandoned") {
    if (!whoCalls) return `You hung up without ${ing}. ${kind === "erase" ? "Erase a few calls and sort them first." : "Listen first: Mira's voiceprint is clear at 0 and static at 4, shifted for the impostor."}`;
    return pMira >= 0.5
      ? `Your evidence favoured Mira (${pc(pMira)}) but you hung up. When the meter leans to Mira, open the door she leans toward.`
      : `Your ${noun} made the impostor look likely (Mira ${pc(pMira)}), but it was really her: a run of unlucky shots. ${kind === "erase" ? "Erasing" : "Listening"} at ${dials} separates the two fastest.`;
  }
  const t = front + side;
  if (!t) return `You chose a door without tracing. Listening can't tell the doors apart; only Trace can. Save two or three calls for tracing.`;
  return `Your traces landed front ${front}, side ${side}, but the call leaned ${leanDoor}. A lean is a probability, so a few traces can point the wrong way. Trace an odd number of times (3 or more) before choosing.`;
}
