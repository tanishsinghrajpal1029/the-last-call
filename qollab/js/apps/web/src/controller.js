/**
 * Orchestrates one run: holds the game state, applies actions through the pure
 * rules, and notifies views (DOM UI, 2D feed, AR painter, audio).
 */
import { applyAction, createGame, publicView } from "../../../packages/core/src/game.js";
import { planRun } from "../../../packages/core/src/nights.js";
export class Controller {
    nights;
    seed;
    provider;
    settings;
    state;
    phase = "intro";
    visual = { lastCallAt: -1e9, last: null, result: null, resultAt: -1e9 };
    sourceLabel;
    listeners = new Set();
    nextId = 0;
    constructor(nights, seed, provider, sourceLabel, settings) {
        this.nights = nights;
        this.seed = seed;
        this.provider = provider;
        this.settings = settings;
        this.state = createGame(nights, planRun(nights, seed), seed);
        this.sourceLabel = sourceLabel;
    }
    on(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }
    emit(e) {
        for (const fn of [...this.listeners]) {
            try {
                fn(e);
            }
            catch (err) {
                console.error(err);
            }
        }
    }
    view() {
        return publicView(this.state);
    }
    /** Hidden lean, only for the evidence meter's visibility (sin alpha is the same for both doors). */
    meterAlphaDeg() {
        return this.state.plan[this.state.index].alphaDeg;
    }
    act(a) {
        const step = applyAction(this.state, a, this.provider);
        if (step.error) {
            this.emit({ type: "error", message: step.error });
            return step;
        }
        this.state = step.state;
        return step;
    }
    id() {
        return "a" + ++this.nextId;
    }
    begin() {
        this.phase = "play";
        this.emit({ type: "state" });
    }
    setDial(d) {
        if (this.phase !== "play")
            return;
        const steps = this.nights.dialSteps;
        this.act({ type: "dial", id: this.id(), dial: ((d % steps) + steps) % steps });
        this.emit({ type: "state" });
    }
    call(kind) {
        if (this.phase !== "play")
            return null;
        const step = this.act({ type: "call", id: this.id(), kind });
        if (step.record) {
            this.visual = { ...this.visual, lastCallAt: performance.now() / 1000, last: step.record };
            this.emit({ type: "call", record: step.record });
            this.emit({ type: "state" });
            return step.record;
        }
        return null;
    }
    decide(choice) {
        if (this.phase !== "play")
            return;
        const step = this.act({ type: "decide", id: this.id(), choice });
        if (step.result) {
            this.phase = "result";
            this.visual = { ...this.visual, result: step.result, resultAt: performance.now() / 1000 };
            this.emit({ type: "result", result: step.result });
            this.emit({ type: "state" });
        }
    }
    next() {
        if (this.phase !== "result")
            return;
        this.act({ type: "next", id: this.id() });
        this.visual = { lastCallAt: -1e9, last: null, result: null, resultAt: -1e9 };
        if (this.state.over) {
            this.phase = "ending";
            this.emit({ type: "over" });
        }
        else {
            this.phase = "intro";
            this.emit({ type: "night" });
        }
        this.emit({ type: "state" });
    }
}
