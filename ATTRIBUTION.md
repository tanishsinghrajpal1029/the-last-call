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
* If other AI tools were used (for example to write the concept document), the team should list
  them here.

## People

Tanish Singh Rajpal. (Add teammates here.)

## Licence

MIT (`LICENSE`). Third-party notices: `THIRD_PARTY_NOTICES.md`.
