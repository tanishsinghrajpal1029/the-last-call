"""Python side of The Last Call on Qollab. Called from main.js with
.callPromising(...); every function returns a JSON string.

Uses the canonical circuit and decoding modules in ./quantum (verbatim copies
of the repository's modules; see quantum/MANIFEST.json).
"""

import datetime
import json
import math
import random
import time

import config
from quantum.circuits import CIRCUIT_VERSION, build_call, dial_angle
from quantum.decode import OUTCOME_MAPPING_VERSION, decode_counts


def load_nights():
    with open("data/nights.json") as f:
        return json.dumps(json.load(f))


def _backend_name(backend):
    name = getattr(backend, "name", None)
    if callable(name):
        try:
            name = name()
        except Exception:
            name = None
    return str(name) if name else type(backend).__name__


def _kind(name):
    if config.BACKEND_KIND != "auto":
        return config.BACKEND_KIND
    n = name.lower()
    if "ionq" in n or "aria" in n or "forte" in n:
        return "ionq_noise"
    if any(k in n for k in ("fake", "noise", "ibm", "heron", "eagle", "boston", "kingston", "pittsburgh",
                            "fez", "marrakesh", "miami", "aachen", "berlin", "torino", "brisbane")):
        return "device_noise"
    return "ideal"


def _key(night, dial, trace):
    return "%d|%d|%s" % (night, dial, "trace" if trace else "listen")


def _integer_counts(totals, shots, rng):
    """Backends that return probabilities (e.g. an ideal IonQ simulator) are
    turned into `shots` samples here; reported as such."""
    vals = list(totals.values())
    if all(float(v).is_integer() for v in vals) and sum(vals) >= 1 and sum(vals) > 1.0001:
        return {k: int(v) for k, v in totals.items()}, False
    s = float(sum(vals))
    keys = list(totals)
    out = {k: 0 for k in keys}
    for _ in range(shots):
        u, acc = rng.random() * s, 0.0
        for k in keys:
            acc += totals[k]
            if u < acc:
                out[k] += 1
                break
        else:
            out[keys[-1]] += 1
    return out, True


def run_calls(backend, plan_json, seed):
    """plan_json: [{"nightId", "alphaDeg", "thetaDeg"}, ...] chosen by main.js.
    Builds 8 dial settings x (listen, trace) per night, submits them in ONE
    backend.run call, decodes the counts. Returns JSON."""
    started = time.perf_counter()
    name = _backend_name(backend)
    kind = _kind(name)
    out = {"ok": False, "backendName": name, "backendKind": kind, "shots": config.SHOTS,
           "circuitVersion": CIRCUIT_VERSION, "outcomeMappingVersion": OUTCOME_MAPPING_VERSION,
           "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
           "bags": {}, "sampledFromProbabilities": False, "jobId": None, "error": None}
    try:
        plan = json.loads(str(plan_json))
        with open("data/nights.json") as f:
            steps = json.load(f)["dialSteps"]
        if config.SHOTS < 12:
            raise ValueError("SHOTS must be at least 12 (the largest call budget)")
        specs, circuits = [], []
        for p in plan:
            for k in range(steps):
                for trace in (False, True):
                    specs.append((int(p["nightId"]), k, trace))
                    circuits.append(build_call(math.radians(float(p["alphaDeg"])), math.radians(float(p["thetaDeg"])),
                                               dial_angle(k, steps), trace, name="n%d-d%d-%s" % (p["nightId"], k, "t" if trace else "l")))
        job = backend.run(circuits, shots=config.SHOTS)
        try:
            out["jobId"] = job.job_id()
        except Exception:
            pass
        result = job.result()
        rng = random.Random(str(seed))
        for i, (night, k, trace) in enumerate(specs):
            raw = {str(key): float(v) for key, v in dict(result.get_counts(i)).items()}
            totals = decode_counts(raw, trace)
            counts, sampled = _integer_counts(totals, config.SHOTS, rng)
            out["sampledFromProbabilities"] = out["sampledFromProbabilities"] or sampled
            out["bags"][_key(night, k, trace)] = {"raw": raw, "totals": counts}
        out["circuits"] = len(circuits)
        out["ok"] = True
    except Exception as e:  # report; never substitute other data
        out["error"] = "%s: %s" % (type(e).__name__, e)
    out["seconds"] = round(time.perf_counter() - started, 3)
    return json.dumps(out)


def circuit_text(trace):
    qc = build_call(math.radians(60), 0.0, dial_angle(1), bool(trace))
    return str(qc.draw(output="text", fold=-1))
