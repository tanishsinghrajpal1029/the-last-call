/**
 * Pure game rules. The hidden truth (who calls, how the call leans) is fixed in
 * the plan before the first call and never changes. Every committed call
 * consumes exactly one fresh outcome from the provider and one call from the
 * budget; nothing is ever re-rolled.
 */
import { CLEAR_LINES, RESULT_TEXT, STATIC_LINES } from "./lines.js";
import { correctDoor } from "./nights.js";
export const POINTS = { correct: 100, perCallLeft: 5, wrongDoor: 20, abandoned: 0, letIn: -100 };
function freshNight(f, idx) {
    const cfg = f.nights[idx];
    return { nightId: cfg.id, budget: cfg.budget, callsLeft: cfg.budget, dial: 0, log: [], decision: null, result: null, points: 0 };
}
export function createGame(nights, plan, seed) {
    if (plan.length !== nights.nights.length)
        throw new Error("plan does not match nights");
    return { seed, nights, plan, index: 0, night: freshNight(nights, 0), history: [], score: 0, over: false, seenActions: [] };
}
function lineText(s, rec) {
    const clearCount = s.night.log.filter((r) => r.line === "clear").length;
    const staticCount = s.night.log.filter((r) => r.line === "static").length;
    const words = rec.line === "clear" ? CLEAR_LINES[clearCount % CLEAR_LINES.length] : STATIC_LINES[staticCount % STATIC_LINES.length];
    return words;
}
export function resultFor(plan, choice) {
    if (plan.caller === "mimic")
        return choice === "hangup" ? "refused" : "letIn";
    if (choice === "hangup")
        return "abandoned";
    const right = correctDoor(plan);
    return right === "either" || right === choice ? "saved" : "wrongDoor";
}
export function pointsFor(result, callsLeft) {
    switch (result) {
        case "saved":
        case "refused":
            return POINTS.correct + POINTS.perCallLeft * callsLeft;
        case "wrongDoor":
            return POINTS.wrongDoor;
        case "abandoned":
            return POINTS.abandoned;
        case "letIn":
            return POINTS.letIn;
    }
}
export function applyAction(s, a, provider) {
    if (s.seenActions.includes(a.id))
        return { state: s }; // duplicate delivery: ignored
    const mark = (st) => ({ ...st, seenActions: [...st.seenActions.slice(-63), a.id] });
    if (s.over)
        return { state: s, error: "The night is over. Start a new run." };
    const plan = s.plan[s.index];
    const n = s.night;
    if (a.type === "dial") {
        if (n.result)
            return { state: s, error: "This call has ended." };
        if (!Number.isInteger(a.dial) || a.dial < 0 || a.dial >= s.nights.dialSteps)
            return { state: s, error: "Unknown dial position." };
        return { state: mark({ ...s, night: { ...n, dial: a.dial } }) };
    }
    if (a.type === "call") {
        if (n.result)
            return { state: s, error: "This call has ended." };
        if (n.callsLeft <= 0)
            return { state: s, error: "No calls left. Decide: open a door or hang up." };
        if (!provider)
            return { state: s, error: "No quantum outcomes are available." };
        const trace = a.kind === "trace";
        let out;
        try {
            out = provider({ nightId: plan.nightId, alphaDeg: plan.alphaDeg, thetaDeg: plan.thetaDeg, dial: n.dial, trace });
        }
        catch (e) {
            return { state: s, error: "The call could not be completed: " + (e instanceof Error ? e.message : String(e)) };
        }
        if (out.line !== "clear" && out.line !== "static")
            throw new Error("invalid outcome");
        if (trace && out.door !== "front" && out.door !== "side")
            throw new Error("trace outcome without a door");
        const base = { n: n.log.length + 1, kind: a.kind, dial: n.dial, line: out.line, source: out.source, ...(trace ? { door: out.door } : {}) };
        const record = { ...base, text: lineText(s, base) };
        const night = { ...n, callsLeft: n.callsLeft - 1, log: [...n.log, record] };
        return { state: mark({ ...s, night }), record };
    }
    if (a.type === "decide") {
        if (n.result)
            return { state: s, error: "You already decided." };
        if (!["front", "side", "hangup"].includes(a.choice))
            return { state: s, error: "Unknown choice." };
        const result = resultFor(plan, a.choice);
        const points = pointsFor(result, n.callsLeft);
        const night = { ...n, decision: a.choice, result, points };
        return { state: mark({ ...s, night, score: s.score + points }), result };
    }
    if (a.type === "next") {
        if (!n.result)
            return { state: s, error: "Decide first." };
        const history = [...s.history, n];
        if (s.index + 1 >= s.nights.nights.length)
            return { state: mark({ ...s, history, over: true }) };
        return { state: mark({ ...s, history, index: s.index + 1, night: freshNight(s.nights, s.index + 1) }) };
    }
    return { state: s, error: "Unknown action." };
}
export function resultText(r) {
    return RESULT_TEXT[r];
}
/** What the player may see: never the plan, until the night is decided. */
export function publicView(s) {
    const cfg = s.nights.nights[s.index];
    const plan = s.plan[s.index];
    return {
        night: cfg,
        state: s.night,
        score: s.score,
        over: s.over,
        revealed: s.night.result ? { caller: plan.caller, door: correctDoor(plan) } : null,
    };
}
