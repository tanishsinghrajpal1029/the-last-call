# Submission checklist

Deadline: **Sunday 11 October 2026, 19:00 Eastern = 16:00 Pacific.** Recheck the official pages
for amendments. Status: ✅ done and evidenced · 🟡 prepared, needs a human action · ❌ not done.

| Requirement | Status | Evidence / next action |
|---|---|---|
| Qiskit; runs on Qollab's free simulators incl. the IonQ simulator path | 🟡 | `qollab/` builds Qiskit circuits and submits one batched job to the injected `backend`. **Run on Qollab (built-in + IonQ simulator); record in `docs/VALIDATION.md`.** |
| Quick credential-free run on a free simulator | 🟡 | 64 circuits × 16 shots, ≤ 2 qubits. Tested with a stub backend only. |
| Public runnable project on Qollab, MIT | 🟡 | Upload the *contents* of `qollab/` (24 files); publish a version; set it as the public default; check signed out. |
| Separate public repo, MIT, dependencies listed, no secrets | 🟡 | Ready. Push to a public GitHub repo; enable Pages (workflow included). |
| Project page: purpose, problem, run/reproduce/extend | 🟡 | `docs/QOLLAB_PROJECT_PAGE.md`; fill in URLs and real results. |
| 2–3 min public demo video | ❌ | Script in `docs/DEMO_SCRIPT.md`. |
| Built in the window; prior material and AI disclosed | 🟡 | `ATTRIBUTION.md` (add teammates and any other AI tools). |
| Accessibility | 🟡 | Captions always on, voice/sound/gentle/reduced-motion toggles, keyboard play, labelled controls, ≥ 44 px targets. No screen-reader audit yet. |
| "This effort is supported by Qollab & IonQ" | ✅ | Qollab page (package check), start screen, README, ATTRIBUTION. |
| Keep the project on Qollab for 12 months | 🟡 | Owner: don't unpublish before October 2027. |
| Tracked AR on at least one tested phone | ❌ | Implemented; desktop fake-camera test passes. **Run `docs/AR_DEVICE_TESTS.md`.** |

Theme at submission: **Quantum Playground**. Only one of The Last Call / Dark Sweeper should be
submitted as the main entry unless the team deliberately submits both (up to 5 projects per team);
their attributions must stay consistent.

## Final pass (in order)

1. Push the repo, enable Pages; open the address on an Android phone and an iPhone; run the device protocol; fix; record.
2. Set `AR_APP_URL` in `qollab/main.js`; `npm run package:qollab`.
3. Upload `qollab/` contents; Run on the built-in simulator and an IonQ simulator; record results; publish; set public default; check signed out.
4. Fill the project page; record and upload the video; measure its length.
5. Captain submits; reopen the submission to check links.
