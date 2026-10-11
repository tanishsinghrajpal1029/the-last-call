"""Render every spoken line with a neural TTS voice and embed the audio.

    PIPER=/path/to/piper/piper PIPER_MODEL=/path/to/en-us-libritts-high.onnx \
        python3 scripts/make_voices.py

* TTS: Piper (MIT, github.com/rhasspy/piper) with the en-us-libritts-high voice
  (trained on LibriTTS, CC BY 4.0). Speakers and settings: shared/voice_lines.json.
* Effects (ffmpeg): telephone band-pass, broken-line static, room, distant, and an
  "eerie" treatment (pitched down, layered an octave lower, long echo) used only for
  the mimic's lines.
* Output: apps/web/src/voicedata.ts (base64 MP3s, imported lazily by the app) and
  data/voices/manifest.json (sizes and hashes). The generated audio is committed, so
  building the game does not need Piper.
"""

import base64
import hashlib
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIPER = os.environ.get("PIPER", "piper")
MODEL = os.environ.get("PIPER_MODEL")

# raise pitch and formants together (a child's voice), keeping the original duration
CHILD = "asetrate=22050*1.3,aresample=22050,atempo=0.8"

FX = {
    "child_phone": "[0:a]" + CHILD + ",highpass=f=320,lowpass=f=3500,acompressor=threshold=0.1:ratio=4:attack=5:release=80,volume=1.6[v];"
                   "anoisesrc=color=pink:amplitude=0.012:sample_rate=22050[n];[v][n]amix=inputs=2:duration=first:normalize=0[o]",
    "child_static": "[0:a]" + CHILD + ",highpass=f=400,lowpass=f=2900,acrusher=bits=6:mix=0.7,"
                    "volume='if(lt(mod(t,0.21),0.11),1.3,0.08)':eval=frame[v];"
                    "anoisesrc=color=white:amplitude=0.09:sample_rate=22050[n];[v][n]amix=inputs=2:duration=first:normalize=0,lowpass=f=5000[o]",
    "child_room": "[0:a]" + CHILD + ",lowpass=f=7500,aecho=0.85:0.6:45|90:0.18|0.1,volume=1.3[o]",
    "child_distant": "[0:a]" + CHILD + ",lowpass=f=1100,aecho=0.8:0.7:120|260:0.35|0.25,volume=1.0[o]",
    # the mimic: her small voice, slowed, with something much deeper speaking underneath it, and a long cold echo
    "child_eerie": "[0:a]" + CHILD + ",asplit=2[a][b];[a]atempo=0.85,tremolo=f=7:d=0.35[a1];"
                   "[b]asetrate=22050*0.5,aresample=22050,atempo=1.7,volume=0.7[b1];"
                   "[a1][b1]amix=inputs=2:duration=longest:normalize=0,aecho=0.8:0.85:340|700:0.45|0.3,lowpass=f=6500,volume=1.5[o]",
    # telephone line: band-limited, compressed, faint hiss
    "phone": "[0:a]highpass=f=320,lowpass=f=3300,acompressor=threshold=0.1:ratio=4:attack=5:release=80,volume=1.6[v];"
             "anoisesrc=color=pink:amplitude=0.012:sample_rate=22050[n];[v][n]amix=inputs=2:duration=first:normalize=0[o]",
    # broken line: chopped, crushed, noisy
    "static": "[0:a]highpass=f=400,lowpass=f=2800,acrusher=bits=6:mix=0.7,"
              "volume='if(lt(mod(t,0.21),0.11),1.3,0.08)':eval=frame[v];"
              "anoisesrc=color=white:amplitude=0.09:sample_rate=22050[n];[v][n]amix=inputs=2:duration=first:normalize=0,lowpass=f=5000[o]",
    "room": "[0:a]lowpass=f=7500,aecho=0.85:0.6:45|90:0.18|0.1,volume=1.3[o]",
    "distant": "[0:a]lowpass=f=1100,aecho=0.8:0.7:120|260:0.35|0.25,volume=0.9[o]",
    # the mimic: slowed and pitched down, doubled an octave lower, long echo
    "eerie": "[0:a]asplit=2[a][b];[a]asetrate=22050*0.8,aresample=22050,atempo=1.0[a1];"
             "[b]asetrate=22050*0.55,aresample=22050,atempo=1.25,volume=0.55[b1];"
             "[a1][b1]amix=inputs=2:duration=longest:normalize=0,aecho=0.8:0.85:300|620:0.4|0.25,lowpass=f=6000,volume=1.4[o]",
}


def synth(text, voice, out_wav):
    cmd = [PIPER, "-m", MODEL, "-s", str(voice["speaker"]), "--length_scale", str(voice["length_scale"]),
           "--noise_scale", str(voice["noise_scale"]), "-f", out_wav]
    subprocess.run(cmd, input=text.encode("utf-8"), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    if not MODEL:
        sys.exit("set PIPER and PIPER_MODEL (see the docstring)")
    with open(os.path.join(ROOT, "shared", "voice_lines.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    tmp = tempfile.mkdtemp()
    data, manifest = {}, {"version": cfg["version"], "model": cfg["model"], "files": {}}
    for line in cfg["lines"]:
        spoken = line.get("speak", line["text"]).replace("“", "").replace("”", "").replace("—", " ")
        raw = os.path.join(tmp, line["id"] + ".wav")
        mp3 = os.path.join(tmp, line["id"] + ".mp3")
        if spoken.strip():
            synth(spoken, cfg["voices"][line["voice"]], raw)
            src = ["-i", raw]
        else:  # pure static
            src = ["-f", "lavfi", "-t", "1.2", "-i", "anullsrc=r=22050:cl=mono"]
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *src, "-filter_complex", FX[line["fx"]], "-map", "[o]",
                        "-ac", "1", "-ar", "22050", "-c:a", "libmp3lame", "-b:a", "40k", mp3], check=True)
        with open(mp3, "rb") as f:
            blob = f.read()
        data[line["id"]] = base64.b64encode(blob).decode("ascii")
        manifest["files"][line["id"]] = {"bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(), "text": line["text"]}
    out = os.path.join(ROOT, "apps", "web", "src", "voicedata.ts")
    with open(out, "w") as f:
        f.write("// GENERATED by scripts/make_voices.py from shared/voice_lines.json. Do not edit.\n")
        f.write("// Piper TTS (MIT) with the en-us-libritts-high voice (LibriTTS, CC BY 4.0); MP3, base64.\n")
        f.write("export const VOICE_VERSION = %s;\n" % json.dumps(cfg["version"]))
        f.write("export const VOICES: Record<string, string> = {\n")
        for k, v in data.items():
            f.write("  %s: %s,\n" % (json.dumps(k), json.dumps(v)))
        f.write("};\n")
    os.makedirs(os.path.join(ROOT, "data", "voices"), exist_ok=True)
    with open(os.path.join(ROOT, "data", "voices", "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
    print("wrote", os.path.relpath(out, ROOT), "%.0f KB" % (os.path.getsize(out) / 1024), len(data), "clips")


if __name__ == "__main__":
    main()
