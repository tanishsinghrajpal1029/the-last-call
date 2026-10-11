"""Assemble and verify the uploadable Qollab project in ./qollab.

    python3 scripts/package_qollab.py          # build (runs tsc via scripts/build.mjs first)
    python3 scripts/package_qollab.py --check  # verify only; non-zero exit on drift

Copies the canonical quantum modules verbatim (hash-checked), the shared
night configuration, the compiled game JS and the stylesheet. Upload the CONTENTS of
./qollab (index.html and main.js must be at the project root).
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Q = os.path.join(ROOT, "qollab")
PY_MODULES = ["circuits.py", "decode.py"]
JS = [
    "apps/web/src/app.js", "apps/web/src/audio.js", "apps/web/src/chart.js", "apps/web/src/controller.js",
    "apps/web/src/feed.js", "apps/web/src/ui.js", "apps/web/src/art.js", "apps/web/src/guide.js",
    "apps/web/src/voicedata.js", "apps/web/src/scare.js",
    "packages/core/src/evidence.js", "packages/core/src/game.js", "packages/core/src/lines.js",
    "packages/core/src/nights.js", "packages/core/src/physics.js", "packages/core/src/providers.js",
    "packages/core/src/rng.js",
]


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def build():
    subprocess.check_call(["node", os.path.join(ROOT, "scripts", "build.mjs")], cwd=ROOT)
    qq = os.path.join(Q, "quantum")
    os.makedirs(qq, exist_ok=True)
    manifest = {"note": "Verbatim copies of the repository's canonical quantum modules.", "files": {}}
    for m in PY_MODULES:
        src = os.path.join(ROOT, "quantum", m)
        shutil.copyfile(src, os.path.join(qq, m))
        manifest["files"][m] = sha(src)
    with open(os.path.join(qq, "__init__.py"), "w") as f:
        f.write('"""Canonical The Last Call quantum modules (copied by scripts/package_qollab.py)."""\n')
    with open(os.path.join(qq, "MANIFEST.json"), "w") as f:
        json.dump(manifest, f, indent=1)
        f.write("\n")
    os.makedirs(os.path.join(Q, "data"), exist_ok=True)
    shutil.copyfile(os.path.join(ROOT, "shared", "nights.json"), os.path.join(Q, "data", "nights.json"))
    for js in JS:
        dst = os.path.join(Q, "js", js)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(os.path.join(ROOT, "build", "js", js)) as f:
            text = f.read()
        text = re.sub(r"\n//# sourceMappingURL=.*$", "\n", text)
        with open(dst, "w") as f:
            f.write(text)
    with open(os.path.join(Q, "main.css"), "w") as out:
        for part in (os.path.join(ROOT, "scripts", "qollab_extra.css"), os.path.join(ROOT, "apps", "web", "style.css")):
            with open(part) as f:
                out.write(f.read() + "\n")
    shutil.copyfile(os.path.join(ROOT, "LICENSE"), os.path.join(Q, "LICENSE"))


def check():
    problems = []
    for name in ("index.html", "main.js", "main.css", "qollab_api.py", "config.py", "LICENSE"):
        if not os.path.exists(os.path.join(Q, name)):
            problems.append("missing root file " + name)
    with open(os.path.join(Q, "quantum", "MANIFEST.json")) as f:
        manifest = json.load(f)
    for m in PY_MODULES:
        src, cp = os.path.join(ROOT, "quantum", m), os.path.join(Q, "quantum", m)
        if sha(src) != sha(cp) or manifest["files"].get(m) != sha(src):
            problems.append("quantum/%s differs from the canonical module" % m)
    for js in JS:
        built = os.path.join(ROOT, "build", "js", js)
        if os.path.exists(built):
            with open(built) as f:
                want = re.sub(r"\n//# sourceMappingURL=.*$", "\n", f.read())
            with open(os.path.join(Q, "js", js)) as f:
                if f.read() != want:
                    problems.append("qollab/js/%s is stale; run scripts/package_qollab.py" % js)
    if sha(os.path.join(ROOT, "shared", "nights.json")) != sha(os.path.join(Q, "data", "nights.json")):
        problems.append("qollab/data/nights.json differs from shared/nights.json")
    # every relative JS import inside the bundle must resolve to a bundled file
    for js in JS:
        with open(os.path.join(Q, "js", js)) as f:
            for m in re.finditer(r'from "(\.[^"]+)"', f.read()):
                target = os.path.normpath(os.path.join(os.path.dirname(os.path.join(Q, "js", js)), m.group(1)))
                if not os.path.exists(target):
                    problems.append("qollab/js/%s imports missing %s" % (js, m.group(1)))
    with open(os.path.join(Q, "main.js")) as f:
        for m in re.finditer(r'from "(\./[^"]+)"', f.read()):
            if not os.path.exists(os.path.join(Q, m.group(1))):
                problems.append("main.js imports missing " + m.group(1))
    files = []
    for dp, _, fns in os.walk(Q):
        for fn in fns:
            if "__pycache__" in dp:
                continue
            files.append(os.path.join(dp, fn))
    if len(files) > 100:
        problems.append("too many files: %d > 100" % len(files))
    for p in files:
        if os.path.getsize(p) > 2 * 1024 * 1024:
            problems.append("file over 2 MB: " + os.path.relpath(p, Q))
        with open(p, "rb") as f:
            blob = f.read().lower()
        for bad in (b"api_key", b"apikey", b"secret", b"password", b"bearer "):
            if bad in blob:
                problems.append("possible secret marker %r in %s" % (bad.decode(), os.path.relpath(p, Q)))
    with open(os.path.join(Q, "index.html")) as f:
        html = f.read()
    if "<script" in html.lower():
        problems.append("index.html contains <script>; Qollab does not execute it")
    if "This effort is supported by Qollab &amp; IonQ" not in html:
        problems.append("attribution line missing from index.html")
    print("qollab/: %d files, largest %.1f KB" % (len(files), max(os.path.getsize(p) for p in files) / 1024))
    for p in problems:
        print("PROBLEM:", p)
    return not problems


if __name__ == "__main__":
    if "--check" not in sys.argv:
        build()
    sys.exit(0 if check() else 1)
