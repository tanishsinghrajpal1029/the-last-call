import json
import math
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from quantum.circuits import call_gate_list, call_width, dial_angle, logical_gate_counts  # noqa: E402
from quantum.decode import classify, decode_counts, key_to_int  # noqa: E402
from quantum.model import density_matrix_probabilities, ideal  # noqa: E402

with open(os.path.join(ROOT, "shared", "nights.json")) as f:
    CFG = json.load(f)
NOISE = CFG["noise"]

try:
    import qiskit  # noqa: F401
    HAVE_QISKIT = True
except Exception:
    HAVE_QISKIT = False


def settings():
    for night in CFG["nights"]:
        for a in night["alphaChoicesDeg"]:
            for t in (CFG["sisterPhaseDeg"], night["mimicPhaseDeg"]):
                for k in range(CFG["dialSteps"]):
                    yield math.radians(a), math.radians(t), dial_angle(k)


class TestModel(unittest.TestCase):
    def test_formula_matches_density_matrix(self):
        for a, t, p in settings():
            for tr in (False, True):
                exact = density_matrix_probabilities(a, t, p, tr)
                for o, v in ideal(a, t, p, tr).items():
                    self.assertAlmostEqual(v, exact[o], places=12)

    def test_normalized_nonnegative_with_noise(self):
        for a, t, p in settings():
            for tr in (False, True):
                pr = density_matrix_probabilities(a, t, p, tr, NOISE)
                self.assertAlmostEqual(sum(pr.values()), 1.0, places=12)
                self.assertTrue(all(v >= -1e-15 for v in pr.values()))

    def test_balanced_interference_fringe(self):
        # alpha = 90 deg: Mira at dial 0 is certainly clear, at dial 4 certainly static
        a = math.pi / 2
        self.assertAlmostEqual(ideal(a, 0, dial_angle(0), False)["clear"], 1.0, places=12)
        self.assertAlmostEqual(ideal(a, 0, dial_angle(4), False)["clear"], 0.0, places=12)
        self.assertAlmostEqual(ideal(a, 0, dial_angle(2), False)["clear"], 0.5, places=12)

    def test_trace_removes_phase_dependence(self):
        for a, t, p in settings():
            pr = density_matrix_probabilities(a, t, p, True)
            clear = pr["front|clear"] + pr["side|clear"]
            self.assertAlmostEqual(clear, 0.5, places=12)
            # and conditioned on either door
            pf = pr["front|clear"] + pr["front|static"]
            if pf > 1e-9:
                self.assertAlmostEqual(pr["front|clear"] / pf, 0.5, places=12)
            self.assertAlmostEqual(pf, math.cos(a / 2) ** 2, places=12)

    def test_trace_is_identity_blind(self):
        # tracing gives the same distribution for Mira and the mimic (no identity information)
        for night in CFG["nights"]:
            for ad in night["alphaChoicesDeg"]:
                for k in range(CFG["dialSteps"]):
                    a, p = math.radians(ad), dial_angle(k)
                    s = density_matrix_probabilities(a, 0, p, True, NOISE)
                    m = density_matrix_probabilities(a, math.radians(night["mimicPhaseDeg"]), p, True, NOISE)
                    for o in s:
                        self.assertAlmostEqual(s[o], m[o], places=12)

    def test_listen_is_door_blind_in_visibility(self):
        # alpha and pi - alpha give identical listen statistics, so listening cannot tell the door
        for t in (0, math.pi / 4, math.pi / 2):
            for k in range(8):
                p = dial_angle(k)
                x = ideal(math.pi / 3, t, p, False)
                y = ideal(2 * math.pi / 3, t, p, False)
                self.assertAlmostEqual(x["clear"], y["clear"], places=12)

    def test_noise_reduces_contrast(self):
        a = math.pi / 2
        clean = ideal(a, 0, 0, False)["clear"]
        noisy = density_matrix_probabilities(a, 0, 0, False, NOISE)["clear"]
        self.assertLess(noisy, clean)
        self.assertGreater(noisy, 0.95)

    def test_reference_table_is_current(self):
        with open(os.path.join(ROOT, "data", "reference", "model_table.json")) as f:
            table = json.load(f)
        self.assertEqual(table["nightsVersion"], CFG["version"])
        self.assertEqual(table["noise"], NOISE)
        for r in table["rows"]:
            a, t, p = math.radians(r["alphaDeg"]), math.radians(r["thetaDeg"]), dial_angle(r["dial"])
            for o, v in density_matrix_probabilities(a, t, p, r["trace"], NOISE).items():
                self.assertAlmostEqual(v, r["noisy"][o], places=12)


class TestCircuits(unittest.TestCase):
    def test_gate_list(self):
        g = call_gate_list(1.0, 0.5, 0.25, False)
        self.assertEqual([x[0] for x in g], ["ry", "p", "p", "h"])
        self.assertEqual(g[2][1], -0.25)
        g = call_gate_list(1.0, 0.5, 0.25, True)
        self.assertEqual([x[0] for x in g], ["ry", "p", "p", "cx", "h"])
        self.assertEqual(call_width(True), 2)
        self.assertEqual(logical_gate_counts(True)["cx"], 1)

    def test_rejects_bad_input(self):
        for bad in (float("nan"), float("inf"), True, "1"):
            with self.assertRaises(ValueError):
                call_gate_list(bad, 0, 0, False)
        for bad in (-1, 8, 1.5, True):
            with self.assertRaises(ValueError):
                dial_angle(bad)


class TestDecode(unittest.TestCase):
    def test_keys(self):
        self.assertEqual(key_to_int("10", 2), 2)
        self.assertEqual(key_to_int("1 0", 2), 2)
        self.assertEqual(key_to_int("0x3", 2), 3)
        self.assertEqual(key_to_int(1, 1), 1)
        for bad in ("2", "", "100", 4, True):
            with self.assertRaises(ValueError):
                key_to_int(bad, 2)

    def test_classify(self):
        self.assertEqual(classify(0, False), "clear")
        self.assertEqual(classify(1, False), "static")
        self.assertEqual(classify(0b10, True), "side|clear")
        self.assertEqual(classify(0b01, True), "front|static")

    def test_decode_counts(self):
        self.assertEqual(decode_counts({"0": 3, "1": 1}, False), {"clear": 3, "static": 1})
        d = decode_counts({"00": 1, "11": 2, "0x2": 1}, True)
        self.assertEqual(d["front|clear"], 1)
        self.assertEqual(d["side|static"], 2)
        self.assertEqual(d["side|clear"], 1)
        with self.assertRaises(ValueError):
            decode_counts({}, False)


@unittest.skipUnless(HAVE_QISKIT, "Qiskit not installed")
class TestQiskit(unittest.TestCase):
    def test_statevector_matches_formula(self):
        from qiskit.quantum_info import Statevector
        from quantum.circuits import build_call

        for a, t, p in settings():
            for tr in (False, True):
                qc = build_call(a, t, p, tr).remove_final_measurements(inplace=False)
                probs = Statevector.from_instruction(qc).probabilities_dict()
                got = {}
                for key, v in probs.items():
                    o = classify(int(key, 2), tr)
                    got[o] = got.get(o, 0) + v
                for o, v in ideal(a, t, p, tr).items():
                    self.assertAlmostEqual(got.get(o, 0), v, places=9)

    def test_circuit_shape(self):
        from quantum.circuits import build_call

        qc = build_call(1.0, 0.0, 0.0, True)
        self.assertEqual(qc.num_qubits, 2)
        self.assertEqual(qc.count_ops().get("cx"), 1)


if __name__ == "__main__":
    unittest.main()
