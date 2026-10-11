# Validation

Produced in the authoring environment (Linux container, Python 3 + NumPy, Node 22, TypeScript
6.0.3, headless Chromium via Playwright). Raw output of the last full run:
[`artifacts/test_log.txt`](../artifacts/test_log.txt).

## What ran and passed

| Suite | Command | Result |
|---|---|---|
| Quantum model: formula = density matrix, normalisation, fringe, trace removes phase dependence and identity information, listen is door-blind, noise, reference table current; circuits; decoding | `python3 -m unittest discover -s tests/quantum` | pass, 2 skipped (need Qiskit) |
| Qollab Python API with a stub `qiskit` and fake backends (one batched job of 56 circuits: each call's own tools incl. the eraser, decoding, probability-returning backend sampled and labelled, failures reported) | included above | pass |
| Game core: TS simulator = Python reference table to 1e-12 (ideal and noisy), plans fixed and hidden, one outcome per call, budget, duplicates, provider errors, all decision outcomes and points, shot bags used once, evidence meter (traces never move it; door-blind), lean-leak validation, voice clips in sync with the game text; marker maths; look-around orientation maths | `node --test tests/core/*.test.mjs` | 28 tests pass |
| Desktop browser smoke: all 7 walkthrough steps (gating, explanations, interference at dials 0/4, trace), the walkthrough can't be soft-locked, neural voice clip decodes, keyboard, full run to the ending, sheet stack, URL-seed escaping, phone layout, no page errors | `node tests/browser/smoke.mjs` | all checks pass (incl. per-call tools, the eraser's sort, Hint, Skip walkthrough) |
| Marker AR with a synthetic fake camera | `node tests/browser/marker_e2e.mjs` | all checks pass |
| Look-around (no-marker) AR with a fake camera and synthetic orientation events | `node tests/browser/gyro_e2e.mjs` | all checks pass |
| Qollab page with a mocked bridge (real `qollab_api.py`, stub Qiskit): status line, circuits, spoiler table, calls use measured shots, 7 listens at dial 4 all static, budget; failure path labelled as ideal model | `node tests/browser/qollab_mock.mjs` and `… broken` | all checks pass |
| Qollab bundle integrity (root files, verbatim quantum modules, fresh JS, imports resolve, ≤ 100 files, ≤ 2 MB, no secrets, no `<script>`, attribution) | `python3 scripts/package_qollab.py --check` | pass |

## Independent code review

A second AI agent reviewed the code read-only and reported 12 findings. All were fixed and covered
by tests where possible: closing a sheet lost the sheet beneath it (now a stack); one arrow key
moved the focused dial twice; held keys and Ctrl+L/Ctrl+T spent calls; sampled shots were captioned
as "measured"; the URL seed was inserted as HTML; circuits were not transpiled for device-noise
backends; exit during XR start or camera start could orphan the session or camera; timers spoke
after exit; a null hit-test pose could throw; the tutorial described results the player had not
seen; a future asymmetric lean choice could leak through the chart (now rejected by validation).
The review does not replace device tests.

A second read-only review of the v2 changes (walkthrough, voices, look-around AR, art) found a
walkthrough soft-lock (spending all calls early), a missing CC BY attribution for the voices,
explanations that ignored the noise model, a voice-overlap race, the look-around house being placed
while the phone was still flat, and smaller start/stop and sheet-stack issues. All were fixed; the
soft-lock has a regression test. It confirmed nothing reveals the hidden caller or door before the
decision.

## Not yet run (pending human actions)

| Item | Why | How |
|---|---|---|
| Local Qiskit tests and `quantum/qiskit_run.py` (the circuits did run in Qiskit on Qollab, below) | Qiskit not installable here | `pip install qiskit` → `python3 -m unittest discover -s tests/quantum -v`; `python3 quantum/qiskit_run.py --out data/qiskit/ideal.json` |
| Phone AR (WebXR, look-around, marker) and real voice playback on iOS | no device | `docs/AR_DEVICE_TESTS.md` |

The Qollab runs below were made by Tanish on qollab.xyz on 11 Oct 2026; numbers are copied from the run output.

## Results that exist

* Exact model tables: `data/reference/model_table.json` (formula and NumPy density matrix; no
  sampling, floating-point error < 1e-12).
* Strategy benchmark: `artifacts/strategy_ideal.md`, `artifacts/strategy_noisy.md` (2000 seeded
  runs per policy, 95% normal intervals). These come from sampling the model, not from a backend.

## Record Qollab runs here

| Date | Backend | Job id | Shots | Night-1 clear rate at dial 0 / dial 4 | Trace / recorded-door clear rate | Notes |
|---|---|---|---|---|---|---|
| 11 Oct 2026 | Qollab Built-in simulator (ideal) | 8adea0e2-c31c-4130-9483-2f3250e1a4fe | 56 circuits × 16 | 16/16 / 0/16 | 70/128 | fitted contrast: listen 0.94, trace 0.18; call 4 eraser all 0.11, + group 1.09 at 88° (impostor) |
| 11 Oct 2026 | IonQ simulator, Aria 1 noise model ([companion project](https://qollab.xyz/u/tanishsinghrajpal/the-last-call-ionq-run)) | 01a12ae6-1c72-7c0f-a516-6a95468e6d72 | one 24-qubit circuit × 100 | (see contrasts) | (see contrasts) | fitted contrast: listen 0.99, recorded door 0.20, + group 1.02 |
| 11 Oct 2026 | IonQ simulator, Aria 1 noise model ([companion project](https://qollab.xyz/u/tanishsinghrajpal/the-last-call-ionq-run)) | 01a12ae9-7f85-7a0a-b5c5-1998da2674af | one 24-qubit circuit × 100 | 100% / 1% | 49% overall (flat) | fitted contrast: listen 1.03 at 0°, recorded door 0.02, + group 1.01 at 6° |

IonQ selected on the JavaScript game page fails with "Failed to fetch" (Qollab's preview frame
can't reach IonQ); no job is created. The page explains this and links to the companion project.
