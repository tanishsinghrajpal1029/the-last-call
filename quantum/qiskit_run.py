"""Run every game circuit with Qiskit (needs `pip install qiskit`; `qiskit-aer`
for --noise) and write measured frequencies next to the reference model.

    python3 quantum/qiskit_run.py --shots 4000 --out data/qiskit/ideal.json
    python3 quantum/qiskit_run.py --noise --out data/qiskit/noisy.json

Not executed in the authoring environment (Qiskit was unavailable there).
"""

import argparse
import datetime
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from quantum.circuits import CIRCUIT_VERSION, build_call, dial_angle  # noqa: E402
from quantum.decode import decode_counts  # noqa: E402
from quantum.model import density_matrix_probabilities, ideal  # noqa: E402


def noise_model(noise):
    from qiskit_aer.noise import NoiseModel, ReadoutError, depolarizing_error

    m = NoiseModel()
    m.add_all_qubit_quantum_error(depolarizing_error(noise["p1"], 1), ["ry", "p", "h"])
    m.add_all_qubit_quantum_error(depolarizing_error(noise["p2"], 2), ["cx"])
    r = noise["readout"]
    m.add_all_qubit_readout_error(ReadoutError([[1 - r, r], [r, 1 - r]]))
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", type=int, default=4000)
    ap.add_argument("--noise", action="store_true")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    with open(os.path.join(ROOT, "shared", "nights.json")) as f:
        cfg = json.load(f)
    plan = []
    for night in cfg["nights"]:
        for a_deg in night["alphaChoicesDeg"]:
            for who, t_deg in (("sister", cfg["sisterPhaseDeg"]), ("mimic", night["mimicPhaseDeg"])):
                for k in range(cfg["dialSteps"]):
                    for trace in (False, True):
                        plan.append((night["id"], a_deg, who, t_deg, k, trace))
    circuits = [build_call(math.radians(a), math.radians(t), dial_angle(k), tr) for (_, a, _, t, k, tr) in plan]
    if args.noise:
        from qiskit import transpile
        from qiskit_aer import AerSimulator
        sim = AerSimulator(noise_model=cfg["noise"] and noise_model(cfg["noise"]), seed_simulator=11)
        circuits = transpile(circuits, sim, basis_gates=["ry", "p", "h", "cx", "measure"], optimization_level=0)
        backend_name = "AerSimulator + illustrative noise"
    else:
        from qiskit.providers.basic_provider import BasicSimulator
        sim = BasicSimulator()
        backend_name = "BasicSimulator"
    result = sim.run(circuits, shots=args.shots, seed_simulator=11).result()
    rows = []
    for i, (night, a, who, t, k, tr) in enumerate(plan):
        counts = {str(key): int(v) for key, v in result.get_counts(i).items()}
        totals = decode_counts(counts, tr)
        total = sum(totals.values())
        ar, tt, pp = math.radians(a), math.radians(t), dial_angle(k)
        rows.append({
            "night": night, "alphaDeg": a, "caller": who, "thetaDeg": t, "dial": k, "trace": tr,
            "counts": counts, "frequencies": {o: c / total for o, c in totals.items()},
            "model": density_matrix_probabilities(ar, tt, pp, tr, cfg["noise"]) if args.noise else ideal(ar, tt, pp, tr),
        })
    try:
        import qiskit
        qv = qiskit.__version__
    except Exception:
        qv = None
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump({"schemaVersion": 1, "sourceMode": "local_qiskit_noise_simulation" if args.noise else "local_ideal_simulation",
                   "backendName": backend_name, "qiskitVersion": qv, "shots": args.shots, "circuitVersion": CIRCUIT_VERSION,
                   "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "rows": rows}, f, indent=1)
    print("wrote", args.out, len(rows), "circuits")


if __name__ == "__main__":
    main()
