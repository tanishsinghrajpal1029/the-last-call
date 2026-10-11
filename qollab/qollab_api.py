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
from quantum.circuits import CIRCUIT_VERSION, build_call, call_gate_list, dial_angle
from quantum.decode import OUTCOME_MAPPING_VERSION, classify, decode_counts, key_to_int


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


def _key(night, dial, kind):
    return "%d|%d|%s" % (night, dial, kind)


KINDS = {"listen": (False, False), "trace": (True, False), "erase": (True, True)}


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


def build_combined(alpha, theta, steps, dials):
    """One wide circuit made of independent blocks (no gate links two blocks):
    a listen block (1 qubit) per dial, then an eraser block (2 qubits) per dial.
    Classical bit i holds qubit i. Returns (circuit, blocks, width)."""
    from qiskit import QuantumCircuit

    blocks, q = [], 0
    for k in dials:
        blocks.append((k, "listen", (q,)))
        q += 1
    for k in dials:
        blocks.append((k, "erase", (q, q + 1)))
        q += 2
    qc = QuantumCircuit(q, q, name="last-call-one-circuit")
    for k, kind, qs in blocks:
        for gate, angle, local in call_gate_list(alpha, theta, dial_angle(k, steps), kind != "listen", kind == "erase"):
            g = [qs[i] for i in local]
            if gate == "ry":
                qc.ry(angle, g[0])
            elif gate == "p":
                qc.p(angle, g[0])
            elif gate == "cx":
                qc.cx(g[0], g[1])
            elif gate == "h":
                qc.h(g[0])
    qc.measure(list(range(q)), list(range(q)))
    return qc, blocks, q


def decode_combined(raw, blocks, width):
    """Marginal outcome totals for every block from the wide circuit's counts."""
    out = {}
    for k, kind, qs in blocks:
        out[(k, kind)] = {}
    for key, c in raw.items():
        c = float(c)
        if c < 0:
            raise ValueError("negative count")
        v = key_to_int(key, width)
        for k, kind, qs in blocks:
            local = (v >> qs[0]) & 1
            if len(qs) > 1:
                local |= ((v >> qs[1]) & 1) << 1
            o = classify(local, kind != "listen", kind == "erase")
            out[(k, kind)][o] = out[(k, kind)].get(o, 0.0) + c
    return out


def _single_circuit(kind):
    if config.SINGLE_CIRCUIT is True or config.SINGLE_CIRCUIT is False:
        return config.SINGLE_CIRCUIT
    return kind == "ionq_noise"


def _run_single(backend, plan, seed, out, steps):
    """IonQ path: one circuit per run. Call 1's settings (Mira, balanced) are
    listened to and erased at every dial in a single 24-qubit circuit."""
    p1 = next(p for p in plan if int(p["nightId"]) == 1)
    qc, blocks, width = build_combined(math.radians(float(p1["alphaDeg"])), math.radians(float(p1["thetaDeg"])), steps, list(config.IONQ_DIALS))
    job = backend.run(qc, shots=config.IONQ_SHOTS)
    try:
        out["jobId"] = job.job_id()
    except Exception:
        pass
    result = job.result()
    raw = {str(key): float(v) for key, v in dict(result.get_counts()).items()}
    rng = random.Random(str(seed))
    for (k, kind), totals in decode_combined(raw, blocks, width).items():
        full = {o: totals.get(o, 0.0) for o in (("clear", "static") if kind == "listen" else ("plus|clear", "plus|static", "minus|clear", "minus|static"))}
        counts, sampled = _integer_counts(full, config.IONQ_SHOTS, rng)
        out["sampledFromProbabilities"] = out["sampledFromProbabilities"] or sampled
        out["bags"][_key(1, k, kind)] = {"totals": counts}
    out["mode"] = "single"
    out["circuits"] = 1
    out["qubits"] = width
    out["shots"] = config.IONQ_SHOTS
    out["ok"] = True


def run_calls(backend, plan_json, seed):
    """plan_json: [{"nightId", "alphaDeg", "thetaDeg"}, ...] chosen by main.js.
    Builds 8 dial settings x each tool the night allows (listen, trace, erase;
    see data/nights.json) per night, submits them in ONE backend.run call and
    decodes the counts. Returns JSON."""
    started = time.perf_counter()
    name = _backend_name(backend)
    kind = _kind(name)
    out = {"ok": False, "backendName": name, "backendKind": kind, "shots": config.SHOTS,
           "circuitVersion": CIRCUIT_VERSION, "outcomeMappingVersion": OUTCOME_MAPPING_VERSION,
           "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
           "bags": {}, "sampledFromProbabilities": False, "jobId": None, "error": None}
    try:
        plan = json.loads(str(plan_json))
        if isinstance(plan, dict):
            plan = plan["nights"]
        with open("data/nights.json") as f:
            nights_cfg = json.load(f)
        steps = nights_cfg["dialSteps"]
        tools_by_night = {n["id"]: n["tools"] for n in nights_cfg["nights"]}
        if _single_circuit(kind):
            _run_single(backend, plan, seed, out, steps)
            out["seconds"] = round(time.perf_counter() - started, 3)
            return json.dumps(out)
        out["mode"] = "batch"
        if config.SHOTS < max(n["budget"] for n in nights_cfg["nights"]):
            raise ValueError("SHOTS must cover the largest call budget")
        specs, circuits = [], []
        for p in plan:
            night = int(p["nightId"])
            for k in range(steps):
                for kind in tools_by_night[night]:
                    trace, eraser = KINDS[kind]
                    specs.append((night, k, kind))
                    circuits.append(build_call(math.radians(float(p["alphaDeg"])), math.radians(float(p["thetaDeg"])),
                                               dial_angle(k, steps), trace, name="n%d-d%d-%s" % (night, k, kind[0]), eraser=eraser))
        # Map to the backend's gate set when possible (needed for device-noise
        # backends, whose noise is attached to native gates). If the backend
        # cannot be targeted by transpile, submit the circuits as built.
        try:
            from qiskit import transpile
            circuits = transpile(circuits, backend=backend, optimization_level=0)
            out["transpiled"] = True
        except Exception as e:  # noqa: BLE001
            out["transpiled"] = False
            out["transpileNote"] = "%s: %s" % (type(e).__name__, e)
        job = backend.run(circuits, shots=config.SHOTS)
        try:
            out["jobId"] = job.job_id()
        except Exception:
            pass
        result = job.result()
        rng = random.Random(str(seed))
        for i, (night, k, kind) in enumerate(specs):
            trace, eraser = KINDS[kind]
            raw = {str(key): float(v) for key, v in dict(result.get_counts(i)).items()}
            totals = decode_counts(raw, trace, eraser)
            counts, sampled = _integer_counts(totals, config.SHOTS, rng)
            out["sampledFromProbabilities"] = out["sampledFromProbabilities"] or sampled
            out["bags"][_key(night, k, kind)] = {"raw": raw, "totals": counts}
        out["circuits"] = len(circuits)
        out["ok"] = True
    except Exception as e:  # report; never substitute other data
        out["error"] = "%s: %s" % (type(e).__name__, e)
    out["seconds"] = round(time.perf_counter() - started, 3)
    return json.dumps(out)


def circuit_text(trace):
    qc = build_call(math.radians(60), 0.0, dial_angle(1), bool(trace))
    return str(qc.draw(output="text", fold=-1))
