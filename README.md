# The Last Call

**A quantum horror game in AR. One call, two doors.**

This effort is supported by Qollab & IonQ

> **The goal, in one sentence:** someone is outside. Use the intercom to find out who it is and
> which door, then let Mira in through the right door, or hang up on the mimic.

Late at night, in a storm, your little sister Mira is outside and asks you to let her in. The intercom shows her at the
front door **and** the side door at the same time: one call, two entrances. Something that sounds
exactly like her has been calling too.

* **Listen** recombines the two door channels at the handset. Whether they add up (a clear line)
  or cancel (static) depends on a dial you control and on the caller's hidden phase. Mira and
  the thing that isn't Mira produce different interference patterns, so listening tells you
  **who** is calling.
* **Trace** records which door the call came through. You learn **where** she is, but the
  which-door record destroys the interference: a traced call is a coin flip at every dial
  setting, for Mira and the mimic alike.

You need both answers: who it is (open, or hang up?) and where she is (which door?). Every
listen and every trace spends one of a handful of calls. **Finding where the caller is destroys
the evidence of who they are.**

![The intercom: two door cameras, the phase dial, the evidence chart](artifacts/screen_trace.png)

## Play

| Where | How |
|---|---|
| Android phone, AR on your table | Chrome on an ARCore phone, HTTPS address of the deployed app → *Play in AR on your table*, move over a table until the ring appears, tap to place the house |
| iPhone, AR with no marker | *Play in AR, no marker*: allow camera and Motion & Orientation; hold the phone up and the house appears ahead of you. Turning and tilting keep it fixed in the room (rotation tracking only; walking around it needs the marker) |
| iPhone (and others), AR on a printed marker | print `marker.html` at 100% (120 mm square), lay it on a table → *Play in AR on a printed marker*: full table tracking, walk around the house |
| Any screen | *Play on this screen* (keyboard: ← → dial, L listen, T trace) |
| **Qollab** | upload the contents of `qollab/`, choose a backend in *Select QPU*, press **Run**: one batched job measures every circuit the game can need, then you play on those shots |

**New players get a short spoken walkthrough** (call 1, 7 steps, skippable): How to win → Two
doors (superposition) → Listen → Turn the dial (interference) → The voiceprint → Trace (measurement
destroys interference) → Decide. Each step unlocks only the control to use; the narrator then
reacts to the result you actually got, with Replay on every step. After that the Guide shows a
plain status line, e.g. **"Mira likely · leans front, but still uncertain · 3 calls left"**, and
your options (listen, trace, or decide now) without choosing for you. A wrong decision explains
what happened from your own evidence and suggests a better plan. Under the door cameras, the two
halves of the call visibly travel to the handset: in step they add up, out of step they cancel,
and a trace records the door and flattens the pattern.

Four calls make one night, and each one changes the game, not just the numbers:

| Call | What is new | Tools | Calls |
|---|---|---|---|
| 1 · The first call | the spoken walkthrough: Mira, balanced, an obvious pattern | Listen, Trace | 8 |
| 2 · Same voice | the impostor's pattern is closer (90° off) and the line holds four calls: choose your dials | Listen | 4 |
| 3 · Two entrances | the call leans toward one door: split six calls between WHO and WHERE | Listen, Trace | 6 |
| 4 · The last call | every call is recorded, so plain listening is flat: **Erase** the record, sort by its reading, and the voiceprint comes back in two halves (the quantum eraser); trace for the door | Trace, Erase | 10 |

The caller on calls 2–4 is Mira or the mimic (50/50, fixed before the first call). Strategy is
yours: the Guide shows the state of the evidence and your options, and the most telling dial
settings are only revealed by the **Hint** button.

## The physics in one paragraph

The call is one qubit; its basis states are the two doors. Each call is a fresh preparation
`Ry(α) · P(θ)` (α: how the call leans between doors; θ: the caller's hidden phase, 0 for Mira).
Listening applies your dial `P(−φ)` and a Hadamard, then measures: P(clear) = ½(1 + sin α cos(θ − φ)).
Tracing adds a CNOT that copies the door onto a second qubit before the Hadamard; then
P(clear) = ½ at every dial and P(front) = cos²(α/2). See [docs/PHYSICS.md](docs/PHYSICS.md).

The interesting part is strategy, not the circuit size: the most telling dial is *not* Mira's own
setting once the mimic is only 90° off, and calls spent on traces are calls not spent on
identifying the caller. On the last call, erasing at Mira's dial wins about 80% of the time;
erasing at the most informative dial and tracing three times, about 89%; nothing wins always
([artifacts/strategy_ideal.md](artifacts/strategy_ideal.md)).

## The last call: the quantum eraser

On call 4 the dying intercom records the door on every call, so an ordinary line is a coin flip
whoever calls. **Erase** reads that record in a way that can't tell front from side (the X basis)
and gives the call a + or −. On their own the erased calls are still flat; the Case file says so
and offers **Sort by the eraser's reading**. Sorted, the + group follows the caller's full
voiceprint and the − group its mirror image, and only then does the WHO meter speak. Nothing is
undone: the pattern exists only in the sorted data. On Qollab the eraser circuits are part of the
same batched job.

## Look and sound

Night-vision door cameras with rain, flicker and lightning. Mira is your little sister and speaks
in a child's voice; what the cameras show is an original creature drawn procedurally in code: a
tall hooded shape with arms too long, the same at both doors, that creeps closer as your calls run
out, leaves faint wet handprints on the camera glass (one per call), presses against the lens on a
broken line, looks straight into the camera if you hang up on it, and shows a cracked, weeping,
too-wide-mouthed face if you let it in. A music
box plays now and then under the rain. Voices are neural text-to-speech (Piper with a
LibriTTS-trained voice, CC BY 4.0), pitched up into a child's voice and processed into a phone line,
broken static and, for the mimic, her voice slowed with something much deeper underneath it.
In the AR modes the reveal fills the whole phone screen (the house on the table is small), and the
figure comes out of the opened door at you first. Captions always carry everything; Gentle mode removes loud stingers, the lens scare and the jump
scare's intensity.

## Where the outcomes come from (honesty)

| Mode | Source of each in-game outcome |
|---|---|
| Web app, *Ideal model* | exact probabilities from the circuit, sampled in the browser. Not a quantum computer. |
| Web app, *Illustrative noise* | same, with our own depolarizing channel (`shared/nights.json`). Not IonQ. |
| Qollab page | shots measured on the backend selected on Qollab, one shot per call, each used once. If a backend returns probabilities instead of shots, the page samples from them and says so. |

The doors, figures and voices are fiction; the circuit never processes audio. Each outcome only
selects which prepared line is shown and spoken. A classical computer can simulate these small
circuits; the point is the rule they teach.

**Status (11 Oct 2026):**

* **Qollab: run and published.** The game page ran on Qollab's Built-in simulator (job
  `8adea0e2-c31c-4130-9483-2f3250e1a4fe`, 56 circuits × 16 shots). The companion project
  [The Last Call — IonQ run](https://qollab.xyz/u/tanishsinghrajpal/the-last-call-ionq-run) ran on the IonQ simulator with the Aria 1 noise model
  (jobs `01a12ae6-1c72-7c0f-a516-6a95468e6d72` and `01a12ae9-7f85-7a0a-b5c5-1998da2674af`, one
  24-qubit circuit × 100 shots). Results: [docs/VALIDATION.md](docs/VALIDATION.md).
* **IonQ from the game page does not work:** Qollab's preview frame can't reach IonQ from a
  JavaScript project ("Failed to fetch"), so the IonQ run lives in the Python companion project.
* **Phone AR: not yet tested on a physical phone.** The three AR modes pass desktop tests with a
  simulated camera and orientation only. Device protocol: [docs/AR_DEVICE_TESTS.md](docs/AR_DEVICE_TESTS.md).

## Build and test

Requirements: Node ≥ 20 with `tsc` on PATH (`npm i -g typescript`), Python 3 with NumPy. No npm
packages.

| Task | Command |
|---|---|
| Build the web app → `build/web` | `npm run build` |
| Unit tests (game rules, TS model vs Python reference, marker maths; Python model) | `npm test` |
| Local server (desktop only) | `npm run serve` → http://localhost:8080 |
| Browser tests (Playwright + Chromium) | `node tests/browser/smoke.mjs`, `marker_e2e.mjs`, `gyro_e2e.mjs`, `qollab_mock.mjs [broken]` |
| Regenerate the voices (needs Piper + the LibriTTS voice) | `PIPER=… PIPER_MODEL=… python3 scripts/make_voices.py` |
| Rebuild + check the Qollab upload | `npm run package:qollab` (`--check` to verify only) |
| Regenerate the reference table | `npm run reference` |
| Strategy benchmark | `npm run strategy` (`-- --noisy`) |
| Run the circuits with Qiskit | `python3 quantum/qiskit_run.py --out data/qiskit/ideal.json` |

**Deploy (HTTPS, needed for phone AR):** push to a public GitHub repo and enable
*Settings → Pages → Source: GitHub Actions*; `.github/workflows/pages.yml` publishes `build/web`.
The live address is https://tanishsinghrajpal.com/the-last-call/ (set as `AR_APP_URL` in `qollab/main.js`).

**On Qollab:** [The Last Call](https://qollab.xyz/u/tanishsinghrajpal/the-last-call) (game, JavaScript + Qiskit) and [The Last Call — IonQ run](https://qollab.xyz/u/tanishsinghrajpal/the-last-call-ionq-run) (Python + Qiskit, source in `qollab_ionq/main.py`).

## Repository

```
shared/nights.json   the four calls, budgets, mimic offsets, illustrative noise (single source of truth)
quantum/             canonical circuits, decoding, NumPy reference model, Qiskit runner
packages/core/       pure game rules, exact simulator, evidence meter, outcome providers
apps/web/            web app: Guide/walkthrough, intercom UI, audio + voice clips, art, WebXR / marker / look-around AR
qollab/              the uploadable Qollab project (built by scripts/package_qollab.py)
qollab_ionq/         the Qollab companion project for IonQ (one 24-qubit circuit, Python)
tests/               unit, Python and browser tests
docs/                physics, design, validation, device tests, page copy, demo script, checklist
```

Origin, reuse and AI assistance: [ATTRIBUTION.md](ATTRIBUTION.md). In short: the AR renderer,
marker tracker, dev server, build scripts and test harnesses were adapted from Dark Sweeper, the
same author's earlier entry in this hackathon; the code and docs were written with Claude
(Anthropic), directed and reviewed by Tanish Singh Rajpal. Licence: MIT.
