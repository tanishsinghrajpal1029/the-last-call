# Design

## The rule the game teaches

> Coherent alternatives can interfere; recording which path removes that ability.

The player needs two answers and the two tools each give one:

| Question | Tool | Why the other tool can't answer it |
|---|---|---|
| Who is calling? | Listen at chosen dial settings | a traced call is 50/50 at every dial, for both callers |
| Which door? | Trace | listening depends only on sin α, identical for both doors |

## The objective, in one sentence

> Someone is outside. Use the intercom to find out who it is and which door, then let Mira in
> through the right door, or hang up on the mimic.

The narrator says it at the start of the walkthrough and the Guide keeps WHO → WHERE → DECIDE in
view on every call.

## The walkthrough (call 1)

Seven gated, spoken steps: How to win → Two doors (superposition) → Listen → Turn the dial
(interference) → The voiceprint → Trace (measurement destroys interference) → Decide. Each step
enables only the control it teaches and highlights it. After each action the narrator reacts to
the result the player actually got (for example "Static. Half a turn out of step, the two halves
cancel each other out", or, after a rare noisy shot, that one listen is never the whole story).
Every step has Replay; the whole walkthrough can be skipped. Equations stay in the optional
"quantum" notes and How it works. The walkthrough never lets optional calls use up the calls
later steps need, and jumps to the decision if the calls run out.

## After the walkthrough: the player chooses

From call 2 the Guide shows a plain status line and the options, without choosing for the player:

> **Mira likely** · leans front, but still uncertain · 3 calls left
> Your options: Listen (dial 2 or 6 tells you most) · Trace · Decide now

The wording never claims more than the evidence: "almost certainly" only above 97%, one-trace
margins stay "uncertain". A wrong decision explains what happened from the player's own evidence
and suggests a better plan (e.g. "Your listens made Mira look 70% likely: a hint, not proof…").

## Seeing the physics in the scene

Under the door cameras, the two halves of the call travel from the doors to the handset; the dial
visibly delays the side half. The handset shows how often the line would come through clear at
this dial **for each hypothesis** (Mira, and the impostor's known offset), so it never reveals the
real caller, and flashes with what was heard. After a trace the traced door's half carries a red
record dot and both patterns go flat ("door recorded: pattern gone"); the next, fresh call
interferes again.

## Suspense

The figure creeps closer as calls run out, footsteps on the porch get louder in the second half of
each call's budget, and if the player hesitates (about 20 s) the caller speaks *through the door*
("Are you still there?"), marked on screen as not on the line and not evidence; the same lines for
Mira and the mimic. The strongest scare comes only after letting the mimic in (full-screen in AR).
Gentle mode removes loud stingers and the quick scares.

## A night: four calls, four mechanics

| Call | Calls | Lean (α) | Mimic offset | Tools | What changes |
|---|---|---|---|---|---|
| 1 · The first call (tutorial) | 8 | balanced | 180° | Listen, Trace | learn an obvious interference pattern; always Mira |
| 2 · Same voice | 4 | balanced | 90° | Listen | a closer pattern and a tight budget: which dials to listen at |
| 3 · Two entrances | 6 | 60° or 120° (75% one door) | 135° | Listen, Trace | divide the budget between WHO and WHERE |
| 4 · The last call | 10 | 60° or 120° | 90° | Trace, Erase | every call is recorded; the quantum eraser's sorted groups identify the caller |

Each call's intro states its new rule in one line (shown and spoken). A tool that a call does not
allow is not shown. The Guide never prints the best dial settings unless the player presses
**Hint**; the result sheet names them afterwards.

### Call 4 in detail

Erase = trace, then read the record in the X basis: the outcome is (+ or −, clear or static).
The Case file keeps the WHO meter closed until the player presses *Sort by the eraser's reading*:
unsorted, all erased calls together are plotted and are flat; sorted, the + group is plotted as it
is and the − group flipped, and both follow the two voiceprints. Trace still finds the door.

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

* Turning the dial is free; every listen, trace and erase costs one call and consumes exactly one fresh
  outcome (one fresh preparation). Duplicate inputs are ignored; nothing is re-rolled.
* Trace asks for confirmation the first time per call and states its cost.
* The evidence meter and chart compare the player's data with both hypotheses. They use
  |sin α|, which is the same for both lean choices, so they never reveal the door.
* The text the caller says is the same pool for Mira and the mimic; words never give it away.
* A trace still leaves the call solvable: there are always calls left for listening.

## Balance (strategy benchmark, 2000 seeded runs per policy)

From [artifacts/strategy_ideal.md](../artifacts/strategy_ideal.md): correct decisions per call.

| Policy | Call 2 | Call 3 | Call 4 |
|---|---|---|---|
| guess | 51% | 40% | 40% |
| trace every call | — (no Trace on call 2) | 50% | 50% |
| WHO calls at Mira's dial 0 (+2 traces) | 97% | 86% | 80% |
| WHO calls at the most informative dial, 3 traces | 95% | 87% | 89% |
| adaptive: WHO calls until sure, then trace | 94% | 87% | 90% |

"WHO calls" are listens, or erase calls on call 4. Lessons the numbers support: on the eraser
call the best dial is not Mira's own; on call 2 Mira's own dial is good because one static there
is proof; an odd number of traces avoids ties; and no policy wins every time, so a loss is part
of the game, with the result sheet explaining what a better plan would have been. The noisy
model gives similar figures ([strategy_noisy.md](../artifacts/strategy_noisy.md)).

## Accessibility

Captions always carry every spoken line and sound cue; the voice, sound and loud stingers can be
turned off (Gentle mode); reduced motion removes grain, flicker and pulses; the dial is a
keyboard slider; all controls are at least 44 px; the screen mode needs no camera.
