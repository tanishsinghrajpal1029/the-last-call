## The Last Call

*A quantum horror game about one call that arrives at two doors.*

This effort is supported by Qollab & IonQ

It is 3:33 am. Your little sister Mira went outside after the cat, and now the intercom picks up a small voice at the **front door and the side door at the same time**. Something outside sounds just like her. You have a few calls before the line goes dead, and two questions: **who** is calling, and **where** is she?

The only way to tell Mira from the thing copying her is **interference**. The only way to find the door is **measurement**. And measuring the door destroys the interference.

* **Play in AR on your phone:** [tanishsinghrajpal.com/the-last-call](https://tanishsinghrajpal.com/the-last-call/)
* **IonQ run:** [The Last Call — IonQ run](https://qollab.xyz/u/tanishsinghrajpal/the-last-call-ionq-run)
* **Source (MIT):** [github.com/tanishsinghrajpal1029/the-last-call](https://github.com/tanishsinghrajpal1029/the-last-call)

---

### Play it in 30 seconds

1. Open *Select QPU*, pick the **Built-in simulator**, and press **Run**. (For IonQ, use the companion project linked above: IonQ accepts one circuit per run, and this game page can't reach IonQ from Qollab's preview frame.)
2. The page sends **one batched job of 56 small circuits** (16 shots each) and waits for the result.
3. The game starts. Every in-game call uses one of those measured shots, once. The caption under each line shows which backend it came from.
4. Call 1 is a short spoken walkthrough. After that you are on your own; press **Hint** only if you want the strategy.

![The walkthrough: the narrator reacts to your result, and the two halves of the call meet at the handset under the door cameras](https://raw.githubusercontent.com/tanishsinghrajpal1029/the-last-call/main/artifacts/screen_listen.png)

---

### Why the quantum part is essential, not decoration

The call is one qubit. Its two basis states are the two doors: |0⟩ = front, |1⟩ = side. The caller is not "at one door, we don't know which": she is in a superposition of both, and the two halves can interfere.

| Your action | What the circuit does | What you learn | What it costs |
|---|---|---|---|
| **Listen** | recombine both doors with a Hadamard, measure | clear line or static, depending on the dial: the caller's **voiceprint** | nothing about the door |
| **Trace** | copy "which door" onto a second qubit (CNOT) first | the **door** | the interference: the line becomes a coin flip at every dial |
| **Erase** (last call) | trace, then read that record in the X basis (+ / −) | nothing until you **sort** your calls by + / −; then the voiceprint returns in two mirror-image halves | the door |

Mira and the impostor differ only in a hidden **phase**, which no single measurement reveals. Only the pattern of interference across dial settings does. The game isn't about randomness; it's about superposition, interference and which-path measurement.

![Listen, Trace and Erase: the exact model of the game's circuits](https://raw.githubusercontent.com/tanishsinghrajpal1029/the-last-call/main/artifacts/how_it_works.png)

---

### The circuit

    q0 (door):   ─ Ry(α) ─ P(θ) ─ P(−φ) ─●─ H ─ M    clear / static
                                         │
    q1 (record): ────────────────────────X─[H]─ M    front / side   (trace)
                                                     + / −          (erase, with the H)

* **α**: how the call leans between the doors (hidden: 90°, or 60° / 120°)
* **θ**: the caller's phase (hidden: 0 for Mira, a known offset for the impostor)
* **φ**: the dial you turn, k × 45°

**Listen:** P(clear) = ½ · (1 + sin α · cos(θ − φ))

**Trace:** P(clear) = ½ at every φ, and P(front) = cos²(α/2)

**Erase:** P(+, clear) = ¼ · (1 + sin α · cos(θ − φ)). Within the + group the full fringe is back; the − group shows its mirror image; both together stay flat. Nothing changes in the past: the pattern exists only in the sorted data.

---

### Four calls, four ideas

| Call | Calls | What changes | Tools |
|---|---|---|---|
| 1 · The first call | 8 | Spoken walkthrough. Mira, an obvious pattern: clear at dial 0, static at dial 4. | Listen, Trace |
| 2 · Same voice | 4 | The impostor is only 90° off and the line holds four calls. Which dials are worth a call? | Listen |
| 3 · Two entrances | 6 | The call leans toward one door. Split the budget between WHO and WHERE. | Listen, Trace |
| 4 · The last call | 10 | Every call is recorded, so plain listening is flat. Erase, sort, and identify the caller; trace for the door. | Trace, Erase |

![Call 4 after sorting: the + group (teal) and the flipped − group (purple) both follow Mira's voiceprint](https://raw.githubusercontent.com/tanishsinghrajpal1029/the-last-call/main/artifacts/screen_eraser_sorted.png?v=2)

---

### Strategy, measured

2,000 seeded games per policy on the ideal model (correct decision rate):

| Policy | Call 2 | Call 3 | Call 4 |
|---|---|---|---|
| Guess | 51% | 40% | 40% |
| Trace every call | (no Trace) | 50% | 50% |
| WHO calls at Mira's own dial 0, then 2 traces | 97% | 86% | 80% |
| WHO calls at the most informative dial, then 3 traces | 95% | 87% | 89% |
| Adaptive: WHO calls until sure, then trace | 94% | 87% | 90% |

Tracing everything is no better than a coin flip at identifying the caller: measuring the path costs exactly the information you needed. On the eraser call, the best dial is not Mira's own. No strategy always wins, so losing is part of the game; the result screen explains what a better plan would have been, using your own evidence.

---

### What to look for in your run

After playing, open **This run's data** (it reveals the callers).

* On an ideal simulator, call 1 is **100% clear at dial 0 and 0% at dial 4**, and traced calls are about **50% clear at every dial**.
* On a noisy backend the fringe contrast shrinks; compare each cell with the ideal value printed beside it.
* On call 4, the + group's clear rate follows the voiceprint, while all erased calls together stay near 50%.

After a successful run, the page also shows a **This run's results** card: a chart of the measured clear rate per dial (call 1 listen vs trace, call 4 eraser groups) and a text summary with fitted fringe contrast and phase.

### Results from real runs

**1 · The full game on the Built-in simulator** (ideal) · job 8adea0e2-c31c-4130-9483-2f3250e1a4fe · 56 circuits × 16 shots

Call 1 (Mira, balanced), clear shots out of 16 per dial setting:

| | dial 0 | dial 1 | dial 2 | dial 3 | dial 4 | dial 5 | dial 6 | dial 7 |
|---|---|---|---|---|---|---|---|---|
| Listen, measured | 16/16 | 13/16 | 7/16 | 4/16 | 0/16 | 2/16 | 8/16 | 13/16 |
| Listen, ideal | 100% | 85% | 50% | 15% | 0% | 15% | 50% | 85% |
| Trace, measured | 10/16 | 6/16 | 8/16 | 9/16 | 10/16 | 11/16 | 9/16 | 7/16 |

* **Listening shows the fringe:** fitted contrast **0.94** (ideal 1.00) at phase 1°.
* **Tracing erases it:** contrast **0.18** (ideal 0); 70 of 128 traced shots clear.
* **The eraser identified the caller on call 4:** all erased shots together are flat (contrast **0.11**); sorted into the + group the fringe returns (contrast **1.09**) at phase **88°**, matching the impostor's 90° offset, not Mira's 0°. It was the impostor.

With 16 shots per dial, a perfectly flat signal still shows a fitted contrast of about 0.16 from shot noise, so 0.18 and 0.11 are consistent with no interference.

**2 · IonQ simulator (Aria 1 noise model)** · job 01a12ae9-7f85-7a0a-b5c5-1998da2674af · one 24-qubit circuit × 100 shots · [IonQ project](https://qollab.xyz/u/tanishsinghrajpal/the-last-call-ionq-run)

IonQ accepts one circuit per run, so this run packs call 1's experiment into a single circuit: a listen block and an eraser block at each of the 8 dials, with no gate linking two blocks.

| | dial 0 | dial 1 | dial 2 | dial 3 | dial 4 | dial 5 | dial 6 | dial 7 |
|---|---|---|---|---|---|---|---|---|
| Listen, measured | 100% | 93% | 46% | 11% | 1% | 14% | 50% | 84% |
| Listen, ideal | 100% | 85% | 50% | 15% | 0% | 15% | 50% | 85% |
| Door recorded, all shots | 50% | 43% | 59% | 45% | 47% | 52% | 46% | 49% |
| + group (record erased) | 100% | 79% | 69% | 10% | 0% | 11% | 43% | 85% |

* **Listening shows the fringe:** fitted contrast **1.03** (ideal 1.00) at phase 0°.
* **Recording the door flattens it:** contrast **0.02** (ideal 0).
* **Erasing the record and sorting brings it back:** + group contrast **1.01** (ideal 1.00) at phase 6°.

With 100 shots per dial each fitted contrast is uncertain by about ±0.05 (±0.07 for the + group). An earlier run of the same circuit (job 01a12ae6-1c72-7c0f-a516-6a95468e6d72) gave 0.99, 0.20 and 1.02; its 0.20 for the recorded door did not repeat here, so we read it as a statistical fluctuation, not an effect of the noise model.

*Fitted contrast and phase: least-squares fit of the clear rate across the 8 dial settings to ½(1 + V·cos(θ − φ)).*

---

### How it was verified

* The closed-form formulas, a NumPy density-matrix simulation and the game's TypeScript simulator agree to 1e-12 for every setting, ideal and with an illustrative noise channel.
* Unit tests check that traces never move the evidence meter, that the meter cannot reveal the door, that every shot is used at most once, and that each call only allows its own tools.
* Browser tests play the whole game, the AR modes with a simulated camera, and this Qollab page against a stand-in backend, including a failing one.
* On real devices: AR played on an Android phone (Chrome, WebXR) and an iPad (look-around). Two iPad problems found there were fixed: the house drew sideways, and it floated instead of standing on the floor.

---

### Also in the project

* **AR on phones and tablets:** WebXR on Android (the house stands on your real floor); look-around AR on iPhone and iPad (aim at the floor, a yellow ring shows where the house will stand, tap Place here; bigger screens get a bigger house); or a printed marker for full table tracking.

![AR on real devices: an Android phone (Chrome, WebXR) and an iPad (look-around, placed on the floor ring), both on the first call](https://raw.githubusercontent.com/tanishsinghrajpal1029/the-last-call/main/artifacts/ar_devices.jpg)
* **Accessibility:** captions for every line and sound, Gentle mode without loud scares, reduced motion, keyboard play.
* **Honesty:** if the backend run fails, the page says why and the game falls back to a clearly labelled ideal model. Backends that return probabilities are sampled in Python and labelled so.

---

### Limitations and what's next

* **Small circuits.** One or two qubits each, easy to simulate classically. The project is about making interference and which-pat* **AR.** Look-around mode follows rotation only, so it can't see the floor: it assumes the device is held about 1.2 m up, and walking around the house needs the printed marker. Tested on an Android phone and an iPad; not yet on an iPhone or with the printed marker. Results: the repo's `docs/AR_DEVICE_TESTS.md`.rker. On real devices so far: WebXR AR works on an Android phone in Chrome, with the house standing on the real floor; look-around AR works on an iPad after a fix (its browser reported the wrong screen rotation), placing the house where you aim at the floor; iPhone and the printed marker are not yet tried. Results are recorded in the repo's `docs/AR_DEVICE_TESTS.md`.
* **Playtesting.** The walkthrough and difficulty were tuned by the strategy benchmark and our own play, not yet by a study with new players.
* **IonQ from the game page.** Qollab's preview frame can't reach IonQ, so the game itself plays on the Built-in simulator's shots and the IonQ run lives in a companion Python project.
* **Next:** a fifth call built on entanglement (two callers sharing one line), a run on IonQ hardware (so far: IonQ's noise-model simulator), and tuning from playtests.

### Run, reproduce, extend

* `config.py`: shots per circuit (16; must cover the largest call budget, 10).
* `data/nights.json`: the four calls, budgets, offsets and tools. Edit it to design your own night.
* `qollab_api.py` builds and submits the circuits; `quantum/` holds the canonical circuit and decoding code; the IonQ run is a separate project: [The Last Call — IonQ run](https://qollab.xyz/u/tanishsinghrajpal/the-last-call-ionq-run).
* Full source, tests and the AR app: [github.com/tanishsinghrajpal1029/the-last-call](https://github.com/tanishsinghrajpal1029/the-last-call) (MIT).

### Credits and disclosure

Built during the hackathon by Tanish Singh Rajpal.

* **Reused code:** the AR renderer, matrix maths, marker tracker, WebXR and marker scaffolding, random-number generator, dev server, build scripts and test harnesses were adapted from **Dark Sweeper**, my earlier entry in this hackathon (MIT; work on it began shortly before the build window opened). Everything quantum and everything specific to this game (circuits, model, rules, evidence meter, intercom UI, story, art, sound, Qollab projects) was written for The Last Call. Full list: [ATTRIBUTION.md](https://github.com/tanishsinghrajpal1029/the-last-call/blob/main/ATTRIBUTION.md).
* **AI assistance:** code, tests, story text and documentation were written with **Claude (Anthropic)** in Claude Cowork, directed and reviewed by me. The quantum-eraser idea came from a parallel version made with another AI tool; no code from it was used.
* **Assets:** voices generated with Piper TTS (MIT) and a voice trained on LibriTTS (CC BY 4.0). The creature, art, sound effects and story are original.

The story is fiction: the circuit never processes audio, and outcomes only choose which prepared line is played. These circuits are small enough to simulate classically; the project is about the rule they make you feel, not speed-up: **coherent alternatives interfere, and recording which path destroys that.**
