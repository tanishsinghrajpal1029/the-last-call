"""Reference predictions, written independently of the TypeScript model.

* ideal_*: closed-form formulas.
* density_matrix_*: NumPy density-matrix simulation of the same gate list,
  optionally with the illustrative depolarizing channel from shared/nights.json
  (lambda-depolarizing after every 1-qubit gate (p1) and after CX on both qubits
  (p2), independent readout flips). Used to cross-check the formulas, the
  TypeScript simulator and (when available) Qiskit.
"""

import math

from quantum.circuits import call_gate_list, call_width
from quantum.decode import ERASER_OUTCOMES, LISTEN_OUTCOMES, TRACE_OUTCOMES, classify


def ideal_listen(alpha, theta, phi):
    pc = (1 + math.sin(alpha) * math.cos(theta - phi)) / 2
    return {"clear": pc, "static": 1 - pc}


def ideal_trace(alpha, theta, phi):
    pf = math.cos(alpha / 2) ** 2
    return {
        "front|clear": pf / 2, "front|static": pf / 2,
        "side|clear": (1 - pf) / 2, "side|static": (1 - pf) / 2,
    }


def ideal_eraser(alpha, theta, phi):
    """Trace, then read the record in the X basis. Closed form for any alpha."""
    v = math.sin(alpha) * math.cos(theta - phi)
    return {"plus|clear": (1 + v) / 4, "plus|static": (1 - v) / 4, "minus|clear": (1 - v) / 4, "minus|static": (1 + v) / 4}


def ideal(alpha, theta, phi, trace):
    return ideal_trace(alpha, theta, phi) if trace else ideal_listen(alpha, theta, phi)


def _gate_matrix(name, angle):
    import numpy as np

    if name == "ry":
        c, s = math.cos(angle / 2), math.sin(angle / 2)
        return np.array([[c, -s], [s, c]], dtype=complex)
    if name == "p":
        return np.array([[1, 0], [0, np.exp(1j * angle)]], dtype=complex)
    if name == "h":
        return np.array([[1, 1], [1, -1]], dtype=complex) / math.sqrt(2)
    raise ValueError(name)


def _embed(u, q, n):
    """1-qubit operator on qubit q of n (qubit 0 = least significant index bit)."""
    import numpy as np

    out = np.array([[1]], dtype=complex)
    for k in reversed(range(n)):
        out = np.kron(out, u if k == q else np.eye(2))
    return out


def _cx(control, target, n):
    import numpy as np

    d = 1 << n
    m = np.zeros((d, d), dtype=complex)
    for i in range(d):
        j = i ^ (1 << target) if (i >> control) & 1 else i
        m[j, i] = 1
    return m


def density_matrix(alpha, theta, phi, trace, noise=None, eraser=False):
    import numpy as np

    n = call_width(trace or eraser)
    d = 1 << n
    rho = np.zeros((d, d), dtype=complex)
    rho[0, 0] = 1
    p1 = noise["p1"] if noise else 0.0
    p2 = noise["p2"] if noise else 0.0
    for name, angle, qubits in call_gate_list(alpha, theta, phi, trace, eraser):
        if name == "cx":
            u = _cx(qubits[0], qubits[1], n)
            rho = u @ rho @ u.conj().T
            if p2:
                rho = (1 - p2) * rho + p2 * np.eye(d) / d  # two-qubit depolarizing (n == 2 here)
        else:
            u = _embed(_gate_matrix(name, angle), qubits[0], n)
            rho = u @ rho @ u.conj().T
            if p1:
                # single-qubit depolarizing on that qubit: (1-p) rho + p * (Tr_q rho) ⊗ I/2
                paulis = [_embed(m, qubits[0], n) for m in (
                    np.array([[0, 1], [1, 0]], dtype=complex),
                    np.array([[0, -1j], [1j, 0]], dtype=complex),
                    np.array([[1, 0], [0, -1]], dtype=complex))]
                twirl = sum(P @ rho @ P.conj().T for P in paulis)
                rho = (1 - p1) * rho + p1 * (rho + twirl) / 4
    return rho


def density_matrix_probabilities(alpha, theta, phi, trace, noise=None, eraser=False):
    n = call_width(trace or eraser)
    rho = density_matrix(alpha, theta, phi, trace, noise, eraser)
    diag = [float(rho[i, i].real) for i in range(1 << n)]
    r = noise["readout"] if noise else 0.0
    # independent symmetric readout flips on each bit
    probs = [0.0] * (1 << n)
    for i, p in enumerate(diag):
        for j in range(1 << n):
            flips = bin(i ^ j).count("1")
            probs[j] += p * (r ** flips) * ((1 - r) ** (n - flips))
    out = {o: 0.0 for o in (ERASER_OUTCOMES if eraser else TRACE_OUTCOMES if trace else LISTEN_OUTCOMES)}
    for j, p in enumerate(probs):
        out[classify(j, trace, eraser)] += p
    return out
