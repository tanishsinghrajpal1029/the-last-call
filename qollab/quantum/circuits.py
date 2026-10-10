"""Canonical circuits for The Last Call.

One call = one fresh preparation of the path qubit q0:
    |0> (front door) and |1> (side door) are the two entrances.

    Ry(alpha)        how the call is split between the doors
                     (P(front) = cos^2(alpha/2) if you trace it)
    P(theta)         the caller's hidden phase (Mira: 0; the mimic: its offset)
    P(-phi)          the player's dial
    [CX q0 -> q1]    TRACE only: copy "which door" onto a record qubit q1
    H                recombine the two door channels at the handset
    measure          q0: 0 = clear line, 1 = static; q1 (trace only): 0 = front, 1 = side

Ideal predictions (no trace):  P(clear) = (1 + sin(alpha) * cos(theta - phi)) / 2
With trace:                    P(clear) = 1/2 for every phi; P(front) = cos^2(alpha/2)

Qiskit is imported lazily so the rest of the package (and the tests that do
not need it) run without it.
"""

import math

CIRCUIT_VERSION = "last-call-call-v1"
DIAL_STEPS = 8


def dial_angle(k, steps=DIAL_STEPS):
    """Dial position k (0..steps-1) in radians: k * 360/steps degrees."""
    if isinstance(k, bool) or not isinstance(k, int) or not 0 <= k < steps:
        raise ValueError("dial position must be an integer 0..%d" % (steps - 1))
    return 2 * math.pi * k / steps


def call_width(trace):
    return 2 if trace else 1


def call_gate_list(alpha, theta, phi, trace):
    """Logical gate sequence (name, angle or None, qubits)."""
    for name, v in (("alpha", alpha), ("theta", theta), ("phi", phi)):
        if not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v):
            raise ValueError("%s must be a finite number" % name)
    gates = [("ry", float(alpha), (0,)), ("p", float(theta), (0,)), ("p", -float(phi), (0,))]
    if trace:
        gates.append(("cx", None, (0, 1)))
    gates.append(("h", None, (0,)))
    return gates


def logical_gate_counts(trace):
    counts = {"ry": 1, "p": 2, "h": 1, "measure": call_width(trace)}
    if trace:
        counts["cx"] = 1
    return counts


def build_call(alpha, theta, phi, trace, name=None):
    """Qiskit QuantumCircuit for one call. Classical bit i holds qubit i."""
    from qiskit import QuantumCircuit

    width = call_width(trace)
    qc = QuantumCircuit(width, width, name=name or ("trace" if trace else "listen"))
    for gate, angle, qubits in call_gate_list(alpha, theta, phi, trace):
        if gate == "ry":
            qc.ry(angle, qubits[0])
        elif gate == "p":
            qc.p(angle, qubits[0])
        elif gate == "cx":
            qc.cx(qubits[0], qubits[1])
        elif gate == "h":
            qc.h(qubits[0])
    qc.measure(list(range(width)), list(range(width)))
    return qc
