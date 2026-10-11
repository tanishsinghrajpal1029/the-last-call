# Physics

## One call, two doors

The call is one qubit `q0`. Its basis states are the entrances: |0⟩ = front door, |1⟩ = side door.
A call is not "at one door, we don't know which": it is a coherent superposition that can
interfere when the two door channels are recombined. Two independent people giving
contradictory answers would not do that.

Every in-game call is a **fresh preparation** of this circuit (nothing is measured twice):

```
q0: |0⟩ ─ Ry(α) ─ P(θ) ─ P(−φ) ─[●]─ H ─ M    0 = clear line, 1 = static
                                  │
q1: |0⟩ ─────────────────────────[X]──── M    trace only: 0 = front, 1 = side
```

| Symbol | Meaning | Who sets it |
|---|---|---|
| α | how the call splits between the doors | hidden, fixed per call (90°, or 60°/120°) |
| θ | the caller's phase: 0 for Mira, a known offset for the mimic | hidden, fixed per call |
| φ | the dial: k · 45°, k = 0…7 | the player, free to change |

## Listen: interference

After `Ry(α) P(θ) P(−φ)` the state is cos(α/2)|0⟩ + e^{i(θ−φ)} sin(α/2)|1⟩. The Hadamard
recombines the doors, giving

  **P(clear) = ½ (1 + sin α · cos(θ − φ))**

* Balanced call (α = 90°): Mira is clear with certainty at φ = 0 and static with certainty at
  φ = 180° (dial 4). That is the tutorial's demonstration of constructive and destructive
  interference.
* The mimic's curve is the same fringe shifted by its offset. Comparing clear/static counts across
  dial settings with the two predicted curves is a two-hypothesis test.
* sin α is the same for α and 180° − α, so **listening cannot tell which door the call leans
  toward**. (The game validates that every night's lean choices share |sin α|, so the evidence
  chart never leaks the lean.)

### Which dial is most telling?

For hypotheses θ = 0 and θ = δ the per-listen difference is
½ sin α [cos φ − cos(δ − φ)], largest at φ = δ/2 ± 90°, not at Mira's own φ = 0. With δ = 90°
(calls 2 and 4), dials 1 and 5 tell nothing (both callers give the same rate there) and dials 3
and 7 tell most on average, while dial 0 is where one static is proof it isn't Mira. The optional
Hint and the end-of-call summary name the most informative dials, computed as the Jensen–Shannon
divergence between the two predicted outcome distributions (over the four eraser outcomes on call 4).

## Trace: which-door information destroys interference

The CNOT copies the door onto `q1` before recombination. Tracing out `q1`, the path state is the
mixture cos²(α/2)|0⟩⟨0| + sin²(α/2)|1⟩⟨1| with no coherence between the doors, and after the
Hadamard

  **P(clear) = ½ for every φ and every θ**, and **P(front) = cos²(α/2)**.

Conditioning on either recorded door also gives ½. So a traced call tells you the door (with the
lean's probability) and nothing about who is calling. This follows from this preparation,
measurement basis and recombination; it is not a claim that every measurement gives 50/50.

The game's evidence meter uses the full likelihood of every call (including traces), and the tests
check that traces leave it unchanged exactly.

## The last call: the quantum eraser

On call 4 every call carries a which-door record (the intercom is damaged), so a plain line is flat.
**Erase** = trace as before (CNOT onto q1), then apply H to q1 before measuring: the record is
read in the X basis, which carries no door information. For general α:

  P(+, clear) = P(−, static) = (1 + sin α cos(θ − φ)) / 4,  P(+, static) = P(−, clear) = (1 − sin α cos(θ − φ)) / 4.

Within the + group the clear rate is ½(1 + sin α cos(θ − φ)), the same voiceprint as listening;
the − group shows the opposite fringe; together they are flat (½ at every dial), so the evidence
meter stays closed until the player sorts. Nothing is changed in the past: the patterns appear
only when the shots are sorted by the eraser's result, and a trace on the next (fresh) call still
finds the door. Formula = density matrix (Python) = TypeScript simulator to 1e-12, ideal and noisy
(the `erase` rows of the reference table).

## Noise

`shared/nights.json` defines an **illustrative** channel used by the web app's noise mode and by
the evidence meter: depolarizing λ = 0.002 after each one-qubit gate, λ = 0.012 after the CNOT,
1% symmetric readout flips. It shrinks the fringe contrast (for example Mira's clear rate at
dial 0, α = 90°, drops from 1 to about 0.986). It is ours, not an IonQ calibration. On Qollab
the backend's own behaviour applies, and the page shows the measured clear rate per dial next
to the ideal value.

## What is and isn't claimed

* The fiction (doors, figures, voices) represents the circuit; phones and intercoms do not behave
  like this, and human attention plays no role in measurement.
* The circuit never produces words. Outcomes only select prepared lines.
* These are 1–2-qubit circuits that any laptop can simulate exactly. Running them on Qollab
  shows real sampled (or hardware-noise-model) shots driving play; it is not a speed-up claim.
* Classical wave cancellation on a speaker would not demonstrate this; the game's mechanism is the
  qubit circuit, not audio.

## Verification

* Closed-form formula = NumPy density matrix (`quantum/model.py`) to 1e-12 for every game setting.
* The TypeScript simulator (`packages/core/src/physics.ts`) is written separately and matches the
  Python reference table (`data/reference/model_table.json`) to 1e-12, ideal and noisy.
* Qiskit statevector tests exist (`TestQiskit`) and run when Qiskit is installed.
