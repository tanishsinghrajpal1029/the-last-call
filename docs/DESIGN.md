# Design

## The rule the game teaches

> Coherent alternatives can interfere; recording which path removes that ability.

The player needs two answers and the two tools each give one:

| Question | Tool | Why the other tool can't answer it |
|---|---|---|
| Who is calling? | Listen at chosen dial settings | a traced call is 50/50 at every dial, for both callers |
| Which door? | Trace | listening depends only on sin α, identical for both doors |

## The walkthrough (call 1)

Seven gated steps in the Guide panel: How to win → Two doors (superposition) → Listen → Turn the
dial (interference) → The voiceprint → Trace (measurement destroys interference) → Decide. Each
step enables only the control it teaches, highlights it, then explains the actual result in game
terms and quantum terms. The walkthrough never lets optional calls use up the calls later steps
need, and jumps straight to the decision if the calls run out. From call 2 on, the Guide shows a
WHO / WHERE / DECIDE checklist with a tip, and a "What just happened" explanation after each call.

## A night

| Call | Calls | Lean (α) | Mimic offset | Caller |
|---|---|---|---|---|
| 1 · The first call (tutorial) | 8 | balanced | 180° | always Mira |
| 2 · Same voice | 6 | balanced | 180° | Mira or mimic, 50/50 |
| 3 · Porch light | 8 | 60° or 120° (75% one door) | 90° | Mira or mimic |
| 4 · The last call | 12 | 60° or 120° | 45° | Mira or mimic |

The run seed fixes the caller and the lean for every call before the first call. Measurement never
changes who is calling. The intel line before each call says how far out of step the mimic would
be, so the player is always testing two known hypotheses.

**Decisions:** open the front door, open the side door, or hang up.

| Truth | Choice | Result | Points |
|---|---|---|---|
| Mira | the door the call leans toward (either if balanced) | saved | +100, +5 per unused call |
| Mira | the other door | wrong door | +20 |
| Mira | hang up | abandoned | 0 |
| Mimic | hang up | refused | +100, +5 per unused call |
| Mimic | open any door | it's inside | −100 |

## Fairness and integrity

* Turning the dial is free; every listen and trace costs one call and consumes exactly one fresh
  outcome (one fresh preparation). Duplicate inputs are ignored; nothing is re-rolled.
* Trace asks for confirmation the first time per call and states its cost.
* The evidence meter and chart compare the player's data with both hypotheses. They use
  |sin α|, which is the same for both lean choices, so they never reveal the door.
* The text the caller says is the same pool for Mira and the mimic; words never give it away.
* A trace still leaves the call solvable: there are always calls left for listening.

## Balance (strategy benchmark, 2000 seeded runs per policy)

From [artifacts/strategy_ideal.md](../artifacts/strategy_ideal.md): correct decisions per call.

| Policy | Call 3 | Call 4 |
|---|---|---|
| guess | 40% | 40% |
| trace every call | 49% | 51% |
| listen at Mira's dial 0, 2 traces | 81% | 64% |
| listen at the most informative dial, 3 traces | 88% | 78% |

Two lessons the numbers support: on the last call the best dial is not Mira's own, and an odd
number of traces avoids ties when choosing the door. The noisy model gives similar figures
([strategy_noisy.md](../artifacts/strategy_noisy.md)).

## Accessibility

Captions always carry every spoken line and sound cue; the voice, sound and loud stingers can be
turned off (Gentle mode); reduced motion removes grain, flicker and pulses; the dial is a
keyboard slider; all controls are at least 44 px; the screen mode needs no camera.
