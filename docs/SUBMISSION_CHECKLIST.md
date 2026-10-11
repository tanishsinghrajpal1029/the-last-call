# Submission checklist

Deadline: **Sunday 11 October 2026, 19:00 Eastern = 16:00 Pacific.** Recheck the official pages
for amendments. Status: ✅ done and evidenced · 🟡 prepared, needs a human action · ❌ not done.

| Requirement | Status | Evidence / next action |
|---|---|---|
| Qiskit; runs on Qollab's free simulators incl. the IonQ simulator path | ✅ | Built-in: job 8adea0e2…; IonQ simulator (Aria 1 noise model) via the companion project: jobs 01a12ae6…, 01a12ae9…. Recorded in `docs/VALIDATION.md`. |
| Quick credential-free run on a free simulator | ✅ | 56 circuits × 16 shots, ≤ 2 qubits, on the Built-in simulator. |
| Public runnable project on Qollab, MIT | ✅ | https://qollab.xyz/u/tanishsinghrajpal/the-last-call and the IonQ companion project. Check both signed out. |
| Separate public repo, MIT, dependencies listed, no secrets | ✅ | https://github.com/tanishsinghrajpal1029/the-last-call; Pages at https://tanishsinghrajpal.com/the-last-call/. |
| Project page: purpose, problem, run/reproduce/extend | ✅ | `docs/QOLLAB_PROJECT_PAGE.md` with real results and links. |
| 2–3 min public demo video | ❌ | Script in `docs/DEMO_SCRIPT.md`. |
| Built in the window; prior material and AI disclosed | ✅ | `ATTRIBUTION.md`; the same summary in the write-up's credits (Dark Sweeper reuse, Claude, Piper/LibriTTS). |
| Accessibility | 🟡 | Captions always on, voice/sound/gentle/reduced-motion toggles, keyboard play, labelled controls, ≥ 44 px targets. No screen-reader audit yet. |
| "This effort is supported by Qollab & IonQ" | ✅ | Qollab page (package check), start screen, README, ATTRIBUTION. |
| Keep the project on Qollab for 12 months | 🟡 | Owner: don't unpublish before October 2027. |
| Tracked AR on at least one tested phone | ✅ | WebXR on an Android phone (Chrome) and look-around on an iPad, 11 Oct. `docs/AR_DEVICE_TESTS.md`. |

Theme at submission: **Quantum Playground**. Only one of The Last Call / Dark Sweeper should be
submitted as the main entry unless the team deliberately submits both (up to 5 projects per team);
their attributions must stay consistent.

## Final pass (in order)

1. Push the repo, enable Pages; open the address on an Android phone and an iPhone; run the device protocol; fix; record.
2. Set `AR_APP_URL` in `qollab/main.js`; `npm run package:qollab`.
3. Upload `qollab/` contents; Run on the built-in simulator and an IonQ simulator; record results; publish; set public default; check signed out.
4. Fill the project page; record and upload the video; measure its length.
5. Captain submits; reopen the submission to check links.
