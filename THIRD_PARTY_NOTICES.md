# Third-party notices

The Last Call's own code, data and documentation are MIT licensed (see `LICENSE`).

* **No third-party code, libraries, fonts or images are bundled.** The renderer, marker tracker,
  UI, procedural horror art (Canvas 2D), sound effects (Web Audio synthesis) and story text were
  written for this project.
* **Voices.** The spoken lines in `apps/web/src/voicedata.ts` were generated with
  **Piper** text-to-speech (MIT licence, https://github.com/rhasspy/piper) using the
  `en-us-libritts-high` voice model, which was trained on the **LibriTTS** corpus
  (H. Zen et al., Google; **CC BY 4.0**, https://www.openslr.org/60/). The audio was then
  processed with ffmpeg (telephone, static and echo effects). Speaker numbers and settings are in
  `shared/voice_lines.json`; `scripts/make_voices.py` regenerates them. If clips are missing, the
  game falls back to the device's own speech synthesis. Piper's bundled espeak-ng (GPL-3) was used
  only as a build-time tool and is not distributed.
* **Runtime platforms (not redistributed):** Qollab's runtime provides Qiskit, Pyodide and its
  JS/Python bridge; the browser provides WebXR, WebGL2, Web Audio, speech synthesis and
  getUserMedia.
* **Development tools (not redistributed):** TypeScript compiler (Apache-2.0), Node.js,
  Playwright/Chromium for tests, NumPy (BSD-3-Clause), optionally Qiskit / Qiskit Aer (Apache-2.0).
* **Science:** single-qubit interference and which-path decoherence are textbook quantum
  mechanics (see `docs/PHYSICS.md`). No text or figures were copied.
* **Genre references** named in the concept (*That's Not My Neighbor*, *No, I'm Not a Human*,
  *Unknown Number*) are cited as prior art only; nothing from them is used.
