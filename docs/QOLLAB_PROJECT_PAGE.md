## The Last Call

*A quantum horror game about one call that arrives at two doors.*

This effort is supported by Qollab & IonQ

It is 3:33 am. Your little sister Mira went outside after the cat, and now the intercom shows a small voice at the **front door and the side door at the same time**. Something out there has learned to sound exactly like her. You have a handful of calls before the line dies, and two questions: **who** is calling, and **where** is she?

The only way to tell Mira from the thing copying her is **interference**. The only way to find the door is **measurement**. And measuring the door destroys the interference.

**Play in AR on your phone:** [Pages address] · **Video (2:30):** [link] · **Source (MIT):** [repo link]

---

### Play it in 30 seconds

1. Open *Select QPU*, pick a simulator (the built-in one, or IonQ's), and press **Run**.
2. The page sends **one batched job of 56 small circuits** (16 shots each) and waits for the result.
3. The game starts. Every in-game call spends one of those measured shots, once. The caption under each line says which backend it came from.
4. Call 1 is a short spoken walkthrough. After that you are on your own; press **Hint** only if you want the strategy.

---

### Why the quantum part is essential, not decoration

The call is one qubit. Its two basis states are the two doors: $|0\rangle$ = front, $|1\rangle$ = side. The caller is not "at one door, we don't know which": she is in a superposition of both, and the two halves can interfere.

| Your action | What the circuit does | What you learn | What it costs |
|---|---|---|---|
| **Listen** | recombine both doors with a Hadamard, measure | clear line or static, depending on the dial: the caller's **voiceprint** | nothing about the door |
| **Trace** | copy "which door" onto a second qubit (CNOT) first | the **door** | the interference: the line becomes a coin flip at every dial |
| **Erase** (last call) | trace, then read that record in the X basis (+ / −) | nothing until you **sort** your calls by + / −; then the voiceprint returns in two mirror-image halves | the door |

Mira and the impostor differ only in a hidden **phase**, which no single measurement reveals. Only the pattern of interference across dial settings does. Randomness is not the mechanic; superposition, interference and which-path measurement are.

---

### The circuit

```
q0 (door):   ─ Ry(α) ─ P(θ) ─ P(−φ) ─●─ H ─ M    clear / static
                                     │
q1 (record): ────────────────────────X─[H]─ M    front / side   (trace)
                                                 + / −          (erase, with the H)
```

* $\alpha$: how the call leans between the doors (hidden: $90°$, or $60°$/$120°$)
* $\theta$: the caller's phase (hidden: $0$ for Mira, a known offset for the impostor)
* $\varphi$: the dial you turn, $k \cdot 45°$

**Listen:** $P(\text{clear}) = \tfrac12\left(1 + \sin\alpha \cos(\theta - \varphi)\right)$

**Trace:** $P(\text{clear}) = \tfrac12$ at every $\varphi$, and $P(\text{front}) = \cos^2(\alpha/2)$

**Erase:** $P(+, \text{clear}) = \tfrac14\left(1 + \sin\alpha\cos(\theta-\varphi)\right)$. Within the + group the full fringe is back; the − group shows its mirror image; both together stay flat. Nothing changes in the past: the pattern exists only in the sorted data.

---

### Four calls, four ideas

| Call | Calls | What changes | Tools |
|---|---|---|---|
| 1 · The first call | 8 | Spoken walkthrough. Mira, an obvious pattern: clear at dial 0, static at dial 4. | Listen, Trace |
| 2 · Same voice | 4 | The impostor is only 90° off and the line holds four calls. Which dials are worth a call? | Listen |
| 3 · Two entrances | 6 | The call leans toward one door. Split the budget between WHO and WHERE. | Listen, Trace |
| 4 · The last call | 10 | Every call is recorded, so plain listening is flat. Erase, sort, and identify the caller; trace for the door. | Trace, Erase |

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

Tracing everything is no better than a coin flip at identifying the caller: measuring the path costs exactly the information you needed. On the eraser call, the best dial is not Mira's own. No policy always wins, so losses are part of the game; the result screen explains what a better plan would have been, using your own evidence.

---

### What to look for in your run

After playing, open **This run's data** (it reveals the callers).

* On an ideal simulator, call 1 is **100% clear at dial 0 and 0% at dial 4**, and traced calls are about **50% clear at every dial**.
* On a noisy backend the fringe contrast shrinks; compare each cell with the ideal value printed beside it.
* On call 4, the + group's clear rate follows the voiceprint, while all erased calls together stay near 50%.

**My runs:** [backend] · job [id] · call 1: [x]% clear at dial 0, [y]% at dial 4 · [second backend, same numbers]

---

### How it was verified

* The closed-form formulas, a NumPy density-matrix simulation and the game's TypeScript simulator agree to $10^{-12}$ for every setting, ideal and with an illustrative noise channel.
* Unit tests check that traces never move the evidence meter, that the meter cannot reveal the door, that every shot is used at most once, and that each call only allows its own tools.
* Browser tests play the whole game, the AR modes with a simulated camera, and this Qollab page against a stand-in backend, including a failing one.

---

### Also in the project

* **AR** on phones: WebXR on Android, look-around AR on iPhone (rotation only), or a printed marker for full table tracking.
* **Accessibility:** captions for every line and sound, Gentle mode without loud scares, reduced motion, keyboard play.
* **Honesty:** if the backend run fails, the page says why and the game falls back to a clearly labelled ideal model. Backends that return probabilities are sampled in Python and labelled so.

---

### Run, reproduce, extend

* `config.py`: shots per circuit (16; must cover the largest call budget, 10).
* `data/nights.json`: the four calls, budgets, offsets and tools. Edit it to design your own night.
* `qollab_api.py` builds and submits the circuits; `quantum/` holds the canonical circuit and decoding code.
* Full source, tests and the AR app: [repo link] (MIT).

### Credits and disclosure

Built during the hackathon. No pre-existing code. Voices: Piper TTS (MIT) with a voice trained on LibriTTS (CC BY 4.0). The creature, art, sound effects and story are original. The idea of a quantum-eraser level came from an earlier experiment in the same project folder.

The story is fiction: the circuit never processes audio, and outcomes only choose which prepared line is played. These circuits are small enough to simulate classically; the project is about the rule they make you feel, not speed-up: **coherent alternatives interfere, and recording which path destroys that.**
