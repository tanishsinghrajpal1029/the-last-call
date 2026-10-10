"""Exercise the Qollab Python API (qollab/qollab_api.py) with a STUB qiskit
module and fake backends that sample from an independent NumPy statevector.

Checks batching (one backend.run call), decoding, the probability-returning
backend path, error reporting and the JSON shape. It is NOT a test of real
Qiskit or of Qollab's runtime; those must be run on Qollab (docs/VALIDATION.md).
"""

import importlib
import json
import math
import os
import random
import sys
import types
import unittest

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
QOLLAB = os.path.join(ROOT, "qollab")


class StubCircuit:
    def __init__(self, nq, nc, name=None):
        self.num_qubits = nq
        self.ops = []
        self.name = name

    def ry(self, a, q):
        self.ops.append(("ry", a, q))

    def p(self, a, q):
        self.ops.append(("p", a, q))

    def h(self, q):
        self.ops.append(("h", None, q))

    def cx(self, c, t):
        self.ops.append(("cx", c, t))

    def measure(self, qs, cs):
        self.ops.append(("measure", list(qs), list(cs)))

    def draw(self, output="text", fold=-1):
        return "stub drawing: %d qubits, %d ops" % (self.num_qubits, len(self.ops))


def statevector(qc):
    n = qc.num_qubits
    psi = np.zeros(2 ** n, dtype=complex)
    psi[0] = 1
    for name, a, q in qc.ops:
        if name == "measure":
            continue
        if name == "cx":
            new = psi.copy()
            for i in range(2 ** n):
                if (i >> a) & 1:
                    new[i ^ (1 << q)] = psi[i]
                else:
                    new[i] = psi[i]
            psi = new
            continue
        if name == "ry":
            u = np.array([[math.cos(a / 2), -math.sin(a / 2)], [math.sin(a / 2), math.cos(a / 2)]])
        elif name == "p":
            u = np.array([[1, 0], [0, np.exp(1j * a)]])
        else:
            u = np.array([[1, 1], [1, -1]]) / math.sqrt(2)
        new = np.zeros_like(psi)
        for i in range(2 ** n):
            b = (i >> q) & 1
            for b2 in (0, 1):
                new[(i & ~(1 << q)) | (b2 << q)] += u[b2, b] * psi[i]
        psi = new
    return np.abs(psi) ** 2


class FakeResult:
    def __init__(self, counts_list):
        self.counts_list = counts_list

    def get_counts(self, i):
        return self.counts_list[i]


class FakeJob:
    def __init__(self, counts_list):
        self._r = FakeResult(counts_list)

    def job_id(self):
        return "fake-job-1"

    def result(self):
        return self._r


class FakeBackend:
    name = "built-in simulator (test double)"

    def __init__(self, probabilities=False):
        self.calls = 0
        self.rng = random.Random(5)
        self.probabilities = probabilities

    def run(self, circuits, shots=1024):
        self.calls += 1
        assert isinstance(circuits, list)
        out = []
        for qc in circuits:
            p = statevector(qc)
            w = qc.num_qubits
            if self.probabilities:
                out.append({format(i, "0%db" % w): float(v) for i, v in enumerate(p) if v > 1e-12})
                continue
            counts = {}
            for _ in range(shots):
                u, acc = self.rng.random(), 0.0
                for i, v in enumerate(p):
                    acc += v
                    if u < acc:
                        break
                k = format(i, "0%db" % w)
                counts[k] = counts.get(k, 0) + 1
            out.append(counts)
        return FakeJob(out)


class BrokenBackend:
    name = "IonQ Forte 1 (broken test double)"

    def run(self, circuits, shots=1024):
        raise RuntimeError("batch rejected")


def load_api():
    stub = types.ModuleType("qiskit")
    stub.QuantumCircuit = StubCircuit
    sys.modules["qiskit"] = stub
    if QOLLAB not in sys.path:
        sys.path.insert(0, QOLLAB)
    for m in ("config", "qollab_api", "quantum", "quantum.circuits", "quantum.decode"):
        sys.modules.pop(m, None)
    return importlib.import_module("qollab_api")


def plan():
    return [{"nightId": 1, "alphaDeg": 90, "thetaDeg": 0}, {"nightId": 2, "alphaDeg": 90, "thetaDeg": 180},
            {"nightId": 3, "alphaDeg": 60, "thetaDeg": 90}, {"nightId": 4, "alphaDeg": 120, "thetaDeg": 0}]


class TestQollabApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cwd = os.getcwd()
        cls.saved = {k: sys.modules.get(k) for k in ("qiskit", "quantum", "quantum.circuits", "quantum.decode")}
        cls.api = load_api()
        os.chdir(QOLLAB)

    @classmethod
    def tearDownClass(cls):
        os.chdir(cls.cwd)
        for k, v in cls.saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
        if QOLLAB in sys.path:
            sys.path.remove(QOLLAB)

    def test_load_nights(self):
        n = json.loads(self.api.load_nights())
        self.assertEqual(len(n["nights"]), 4)

    def test_one_batched_job_and_decoding(self):
        b = FakeBackend()
        run = json.loads(self.api.run_calls(b, json.dumps(plan()), "s"))
        self.assertTrue(run["ok"], run["error"])
        self.assertEqual(b.calls, 1)
        self.assertEqual(run["circuits"], 64)
        self.assertEqual(run["jobId"], "fake-job-1")
        self.assertFalse(run["sampledFromProbabilities"])
        # night 1 (Mira, balanced): dial 0 always clear, dial 4 always static (ideal fake backend)
        self.assertEqual(run["bags"]["1|0|listen"]["totals"], {"clear": 16, "static": 0})
        self.assertEqual(run["bags"]["1|4|listen"]["totals"], {"clear": 0, "static": 16})
        # night 2 (mimic, 180 deg): reversed
        self.assertEqual(run["bags"]["2|0|listen"]["totals"]["static"], 16)
        # traces: four door|line outcomes summing to the shots
        t = run["bags"]["3|2|trace"]["totals"]
        self.assertEqual(sorted(t), ["front|clear", "front|static", "side|clear", "side|static"])
        self.assertEqual(sum(t.values()), 16)
        # night 4 leans to the side door: no front-door traces for alpha = 120? (P(front) = 0.25)
        fronts = sum(run["bags"]["4|%d|trace" % k]["totals"]["front|clear"] + run["bags"]["4|%d|trace" % k]["totals"]["front|static"] for k in range(8))
        self.assertTrue(10 < fronts < 55, fronts)  # 128 shots at p = 0.25

    def test_probability_backend_is_sampled_and_labelled(self):
        run = json.loads(self.api.run_calls(FakeBackend(probabilities=True), json.dumps(plan()), "s"))
        self.assertTrue(run["ok"], run["error"])
        self.assertTrue(run["sampledFromProbabilities"])
        for v in run["bags"].values():
            self.assertEqual(sum(v["totals"].values()), 16)
            self.assertTrue(all(isinstance(x, int) for x in v["totals"].values()))
        self.assertEqual(run["bags"]["1|0|listen"]["totals"]["clear"], 16)

    def test_errors_are_reported_not_hidden(self):
        run = json.loads(self.api.run_calls(BrokenBackend(), json.dumps(plan()), "s"))
        self.assertFalse(run["ok"])
        self.assertIn("batch rejected", run["error"])
        self.assertEqual(run["bags"], {})
        self.assertEqual(run["backendKind"], "ionq_noise")

    def test_circuit_text(self):
        self.assertIn("2 qubits", self.api.circuit_text(True))


if __name__ == "__main__":
    unittest.main()
