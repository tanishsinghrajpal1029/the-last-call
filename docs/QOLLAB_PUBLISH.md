# Publishing on qollab.xyz (step by step)

Source: Qollab's own guides, *Create a Project on Qollab* and *Hackathon: how it works*
(qollab.xyz/learn/code/create-project, qollab.xyz/programs/hackathon/how-it-works). Re-check both
pages on the day; the UI labels below are quoted from them.

## 0. Before you upload (on the Mac)

```
npm run build
python3 scripts/package_qollab.py --check     # must print no PROBLEM lines
```

Upload the **contents** of `qollab/` (29 files), not the folder itself: `index.html` and `main.js`
must be at the project root, or Run stays disabled.

```
index.html  main.js  main.css  qollab_api.py  config.py  requirements.txt  LICENSE
data/nights.json
js/…  (compiled game)
quantum/circuits.py  quantum/decode.py  quantum/__init__.py  quantum/MANIFEST.json
```

Do not upload `__pycache__`, `node_modules`, `build/`, the voice generator or the tests.

## 1. Create the project

1. Sign in at qollab.xyz (a free account with a username).
2. **+ New Project** (top navigation) → **Create New Project**.
3. **Project Title:** The Last Call. **Project description** (≤ 240 characters), for example:
   *A quantum horror game: one call at two doors. Listen to see interference, trace to find the
   door and lose it, erase the record to get it back. Runs on the backend you pick.*
4. Project shape: **Upload your own files** → add the files above (a folder or a zip of the
   contents works). A top-level `index.html` + `main.js` makes it run as JS.
5. **Create**. This opens the private draft in edit mode.

## 2. Run it before publishing

1. **Select QPU** → the built-in simulator first. Keep the default run settings; `config.py` sets
   16 shots per circuit (the job is 56 circuits).
2. **Run**. The status line on the page should read "Done in … on “<backend>”: 56 circuits × 16
   shots, job …". Play one call; the captions must say "measured shot from …".
3. Open *This run's data* and note backend, job id and the dial-0 / dial-4 clear rates of call 1.
4. Repeat with the IonQ simulator (the whole job is one `backend.run` call, which IonQ needs).
5. If a run fails, the page says why and falls back to the clearly labelled ideal model; fix the
   cause (usually a missing file at the root) and Run again. Never submit on the fallback.

## 3. Fill the project page (Project Card tab)

* Write-up: paste `docs/QOLLAB_PROJECT_PAGE.md`, with the bracketed items replaced by the real
  values from step 2 (backend names, job ids, numbers). Keep the line
  *This effort is supported by Qollab & IonQ*.
* Sidebar: **Contributors** (every teammate), **Tags**, **Repositories** (the public GitHub repo),
  **Project Website** (the GitHub Pages address of the AR app, once it exists; also set
  `AR_APP_URL` in `main.js` and re-upload `main.js`).
* Disclose pre-existing code: none, except the Piper voice clips (MIT) and the LibriTTS voice
  (CC BY 4.0), already credited in the write-up.

## 4. Publish a version

1. **Publish** in the project header.
2. **Version name**, e.g. `v1-hackathon`; optional **Release notes**.
3. Visibility: **public**.
4. **Publish Version**. A version is an immutable snapshot; later edits stay in the draft until you
   publish again.

## 5. Check it signed out

Open the project link in a private window: the page, the Run button and the write-up must work
with no sign-in. Press Run there once on the built-in simulator.

## 6. Submit

1. The team captain opens the hackathon registration page and submits the project link, the
   public repo link (MIT, no secrets, dependencies listed) and the 2–3 minute video link
   (YouTube, Loom, Vimeo or Drive, viewable without sign-in). Declare the theme: Quantum Playground.
2. Deadline: Sun 11 Oct 2026, 19:00 ET (16:00 PT). The submission can be edited until then.
3. Leave the project published for at least 12 months.
