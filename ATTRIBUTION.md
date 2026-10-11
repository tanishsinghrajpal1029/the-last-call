# Origin and attribution

This effort is supported by Qollab & IonQ

## What existed before this build

* **The concept document** "The Last Call" (a written game concept: two entrances, phase dial,
  recombine, trace, decide; with its science boundaries), provided by the team. This build adds
  one design change from review: the caller carries a hidden phase, so the dial measures something
  about the caller instead of choosing the outcome. No code came with the concept.
* **Dark Sweeper**, the team's earlier entry built during this same hackathon (same repository
  owner, MIT). These files were reused and adapted from it:
  `apps/web/src/ar/gl.ts`, `math.ts`, `markerMath.ts` (renderer, matrix maths, marker tracker),
  the structure of `ar/xr.ts` and `ar/marker.ts`, `apps/web/marker.html`, `packages/core/src/rng.ts`,
  `scripts/serve.mjs`, the build/packaging scripts, `tests/core/marker.test.mjs` and the browser
  test harnesses. Work on Dark Sweeper started shortly before the build window opened; the git
  history of both repositories records the actual times.
* No code from other projects, forks, templates or tutorials was used.

## What was built for The Last Call

Everything else: the circuits and reference model, the night design, game rules, evidence meter,
outcome providers, intercom UI, generated audio, 2D feed, AR diorama, Qollab project, tests,
benchmark and documentation, written on 10–11 October 2026. The git history records the actual
commit times.

## The quantum-eraser call

The idea of adding a quantum-eraser level came from a parallel version of this project that was
made in the same folder with another AI tool. That version is kept unchanged in
`the-last-call_parallel-version-backup` next to this folder. The eraser here (call 4, and the
earlier bonus scene it replaced) is a new implementation built on this project's own circuits,
model and tests.

## Generated assets

* Voices: generated with Piper TTS (MIT) and the `en-us-libritts-high` voice (trained on LibriTTS,
  CC BY 4.0), then processed with ffmpeg; see `THIRD_PARTY_NOTICES.md`. The creature and scenes are
  procedural Canvas drawings written for this game (an original design, not based on any film
  character).

## AI assistance

* Code, tests, story text and documentation were written with **Claude (model configured as
  Claude Opus 5.5) in Claude Cowork**, directed and reviewed by Tanish Singh Rajpal. A second
  Claude agent performed a read-only code review; its findings were fixed (see
  `docs/VALIDATION.md`).
* The parallel version that suggested the quantum-eraser call (see above) was made with another
  AI tool; no code from it was used.

## People

Tanish Singh Rajpal.

## One-paragraph summary (used on the Qollab page)

Built during the hackathon by Tanish Singh Rajpal. Reused code: the AR renderer, matrix maths,
marker tracker, WebXR and marker scaffolding, random-number generator, dev server, build scripts
and test harnesses were adapted from Dark Sweeper, the same author's earlier entry in this
hackathon (MIT; work on it began shortly before the build window opened). Everything quantum and
everything specific to this game was written for The Last Call. AI assistance: code, tests, story
text and documentation were written with Claude (Anthropic) in Claude Cowork, directed and reviewed
by Tanish Singh Rajpal; the quantum-eraser idea came from a parallel version made with another AI
tool (no code from it was used).

## Licence

MIT (`LICENSE`). Third-party notices: `THIRD_PARTY_NOTICES.md`.
