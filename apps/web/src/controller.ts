/**
 * Orchestrates one run: holds the game state, applies actions through the pure
 * rules, and notifies views (DOM UI, 2D feed, AR painter, audio).
 */

import { Action, applyAction, CallRecord, createGame, GameState, Provider, publicView } from "../../../packages/core/src/game.js";
import { ResultKind } from "../../../packages/core/src/lines.js";
import { NightsFile, planRun } from "../../../packages/core/src/nights.js";

export interface Settings {
  voice: boolean;
  sound: boolean;
  gentle: boolean;
  meter: boolean;
  reducedMotion: boolean;
}

export type ControllerEvent =
  | { type: "state" }
  | { type: "call"; record: CallRecord }
  | { type: "result"; result: ResultKind }
  | { type: "error"; message: string }
  | { type: "night" }
  | { type: "over" };

/** Visual state shared by the 2D feed and the AR painter. */
export interface Visual {
  /** time (s, performance clock) of the last committed call */
  lastCallAt: number;
  last: CallRecord | null;
  result: ResultKind | null;
  resultAt: number;
}

export type Phase = "intro" | "play" | "result" | "ending";

export class Controller {
  state: GameState;
  phase: Phase = "intro";
  visual: Visual = { lastCallAt: -1e9, last: null, result: null, resultAt: -1e9 };
  readonly sourceLabel: string;
  private listeners = new Set<(e: ControllerEvent) => void>();
  private nextId = 0;

  constructor(readonly nights: NightsFile, readonly seed: string, private provider: Provider, sourceLabel: string, readonly settings: Settings) {
    this.state = createGame(nights, planRun(nights, seed), seed);
    this.sourceLabel = sourceLabel;
  }

  on(fn: (e: ControllerEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(e: ControllerEvent): void {
    for (const fn of [...this.listeners]) {
      try {
        fn(e);
      } catch (err) {
        console.error(err);
      }
    }
  }

  view() {
    return publicView(this.state);
  }

  /** Hidden lean, only for the evidence meter's visibility (sin alpha is the same for both doors). */
  meterAlphaDeg(): number {
    return this.state.plan[this.state.index]!.alphaDeg;
  }

  private act(a: Action) {
    const step = applyAction(this.state, a, this.provider);
    if (step.error) {
      this.emit({ type: "error", message: step.error });
      return step;
    }
    this.state = step.state;
    return step;
  }

  private id(): string {
    return "a" + ++this.nextId;
  }

  begin(): void {
    this.phase = "play";
    this.emit({ type: "state" });
  }

  setDial(d: number): void {
    if (this.phase !== "play") return;
    const steps = this.nights.dialSteps;
    this.act({ type: "dial", id: this.id(), dial: ((d % steps) + steps) % steps });
    this.emit({ type: "state" });
  }

  call(kind: "listen" | "trace"): CallRecord | null {
    if (this.phase !== "play") return null;
    const step = this.act({ type: "call", id: this.id(), kind });
    if (step.record) {
      this.visual = { ...this.visual, lastCallAt: performance.now() / 1000, last: step.record };
      this.emit({ type: "call", record: step.record });
      this.emit({ type: "state" });
      return step.record;
    }
    return null;
  }

  decide(choice: "front" | "side" | "hangup"): void {
    if (this.phase !== "play") return;
    const step = this.act({ type: "decide", id: this.id(), choice });
    if (step.result) {
      this.phase = "result";
      this.visual = { ...this.visual, result: step.result, resultAt: performance.now() / 1000 };
      this.emit({ type: "result", result: step.result });
      this.emit({ type: "state" });
    }
  }

  next(): void {
    if (this.phase !== "result") return;
    this.act({ type: "next", id: this.id() });
    this.visual = { lastCallAt: -1e9, last: null, result: null, resultAt: -1e9 };
    if (this.state.over) {
      this.phase = "ending";
      this.emit({ type: "over" });
    } else {
      this.phase = "intro";
      this.emit({ type: "night" });
    }
    this.emit({ type: "state" });
  }
}
