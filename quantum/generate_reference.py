"""Write data/reference/model_table.json: ideal (formula) and illustrative-noise
(NumPy density matrix) outcome probabilities for every setting the game uses.
The TypeScript simulator is tested against this table.

Run: python3 quantum/generate_reference.py
"""

import datetime
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from quantum.circuits import CIRCUIT_VERSION, dial_angle  # noqa: E402
from quantum.decode import OUTCOME_MAPPING_VERSION  # noqa: E402
from quantum.model import density_matrix_probabilities, ideal, ideal_eraser  # noqa: E402


def main():
    with open(os.path.join(ROOT, "shared", "nights.json")) as f:
        cfg = json.load(f)
    noise = cfg["noise"]
    rows = []
    for night in cfg["nights"]:
        for a_deg in night["alphaChoicesDeg"]:
            for who, t_deg in (("sister", cfg["sisterPhaseDeg"]), ("mimic", night["mimicPhaseDeg"])):
                for k in range(cfg["dialSteps"]):
                    a, t, p = math.radians(a_deg), math.radians(t_deg), dial_angle(k, cfg["dialSteps"])
                    # every tool, whether or not this night allows it: the evidence meter compares hypotheses with all of them
                    for kind in ("listen", "trace", "erase"):
                        trace, eraser = kind != "listen", kind == "erase"
                        rows.append({
                            "night": night["id"], "alphaDeg": a_deg, "caller": who, "thetaDeg": t_deg,
                            "dial": k, "kind": kind, "trace": trace,
                            "ideal": ideal_eraser(a, t, p) if eraser else ideal(a, t, p, trace),
                            "idealDensityMatrix": density_matrix_probabilities(a, t, p, trace, None, eraser),
                            "noisy": density_matrix_probabilities(a, t, p, trace, noise, eraser),
                        })
    out = {
        "schemaVersion": 1,
        "sourceMode": "local_reference_model",
        "description": "ideal = closed-form formula; idealDensityMatrix and noisy = NumPy density-matrix simulation (noisy uses the illustrative channel in shared/nights.json, not IonQ)",
        "circuitVersion": CIRCUIT_VERSION,
        "outcomeMappingVersion": OUTCOME_MAPPING_VERSION,
        "nightsVersion": cfg["version"],
        "noise": noise,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "rows": rows,
    }
    os.makedirs(os.path.join(ROOT, "data", "reference"), exist_ok=True)
    path = os.path.join(ROOT, "data", "reference", "model_table.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("wrote", os.path.relpath(path, ROOT), len(rows), "rows")


if __name__ == "__main__":
    main()
