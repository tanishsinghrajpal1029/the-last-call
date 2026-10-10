# Qollab project page copy

Paste into the Qollab project page. Replace bracketed items once they exist; never publish a
placeholder as a fact.

---

## The Last Call — one call, two doors

This effort is supported by Qollab & IonQ

Your sister calls and asks you to let her in. The intercom shows her at both doors at once.
**Listen** and the two door channels interfere: the pattern across dial settings tells you who is
calling. **Trace** and you learn which door she is at, but the which-door record destroys the
interference. Finding *where* she is costs you the evidence of *who* she is.

**Press Run.** The page submits one batched job to the backend in *Select QPU* (64 circuits of 1–2
qubits) and the game plays on those shots: every listen or trace uses one shot, once.

**Play in AR:** [AR app URL] · **Tested phones:** [none yet] · **Video:** [link]

### The problem we explore
Interference between coherent alternatives, and its loss when which-path information is
recorded, is the heart of quantum mechanics and usually taught with a beam-splitter diagram. We
turned it into a decision under uncertainty with stakes: a two-hypothesis test (is it Mira?) that
only interference can answer, and a location question (which door?) that only a which-path
measurement can answer, sharing one small budget of calls.

### The circuit
`q0`: Ry(α) · P(θ) · P(−φ) · [CNOT q0→q1 if tracing] · H · measure.
P(clear) = ½(1 + sin α cos(θ − φ)); traced: P(clear) = ½ at every φ, P(front) = cos²(α/2).
θ = 0 for Mira; the mimic is out of step by 180°, 90°, then 45°.

### What to look for in your run
Open *This run's data* after playing (it reveals the callers). On an ideal simulator, call 1 should
be 100% clear at dial 0 and 0% at dial 4, and traces about 50% clear at every dial. On a noisy
backend the fringe contrast shrinks; compare with the ideal column.
[Paste your recorded results: backend, job id, key numbers.]

### Run, reproduce, extend
* `config.py`: shots per circuit (default 16, at least 12).
* Source, tests and the AR app: [repository URL] (MIT). `shared/nights.json` defines the calls.
* Honesty: outcomes on this page are shots from the selected backend (sampled from returned
  probabilities if the backend returns probabilities, and labelled so). The story, voices and
  figures are fiction; the circuit never processes audio. These circuits are small enough to
  simulate classically; the project is about the rule they teach, not speed-up.
