"""The Last Call: the IonQ run (a Qollab *Python* project).

IonQ accepts one circuit per run, so this sends ONE 24-qubit circuit:
call 1's settings (Mira, balanced: alpha = 90 deg, theta = 0) at all 8 dial
settings, twice:

  * a 1-qubit LISTEN block per dial   Ry(a) P(theta) P(-phi) H, measure
  * a 2-qubit ERASE block per dial    Ry(a) P(theta) P(-phi), CX q0->q1 (the door
                                      is recorded), H on q0, H on q1 (the record is
                                      read as + / -), measure both

No gate links two blocks, so every block is its own experiment and all 16 are
measured in the same shots. It prints the clear-line rate per dial for:
listen; the eraser blocks with every shot together (the door was recorded:
flat); and the eraser's + group (the fringe comes back).

Choose a backend in "Select QPU" (e.g. IonQ Aria 1, noise model) and press Run.
Same circuits as the game: github.com/tanishsinghrajpal1029/the-last-call (MIT).
"""

import math

from qiskit import QuantumCircuit

SHOTS = 100
DIALS = list(range(8))  # 8 listen qubits + 8 eraser pairs = 24 qubits (IonQ Aria has 25)
ALPHA = math.pi / 2     # call 1: balanced between the doors
THETA = 0.0             # call 1: Mira's phase


def phi(k):
    return 2 * math.pi * k / 8


def build():
    blocks, q = [], 0
    for k in DIALS:
        blocks.append((k, "listen", (q,)))
        q += 1
    for k in DIALS:
        blocks.append((k, "erase", (q, q + 1)))
        q += 2
    qc = QuantumCircuit(q, q, name="last-call-one-circuit")
    for k, kind, qs in blocks:
        a = qs[0]
        qc.ry(ALPHA, a)
        qc.p(THETA, a)
        qc.p(-phi(k), a)
        if kind == "erase":
            qc.cx(a, qs[1])
        qc.h(a)
        if kind == "erase":
            qc.h(qs[1])
    qc.measure(list(range(q)), list(range(q)))
    return qc, blocks, q


def key_to_int(key, width):
    s = str(key).replace(" ", "")
    v = int(s, 16) if s.lower().startswith("0x") else int(s, 2)
    if not 0 <= v < (1 << width):
        raise ValueError("key outside register: %r" % (key,))
    return v


def decode(counts, blocks, width):
    """Per block: listen -> {clear, static}; erase -> {plus|clear, ...}."""
    out = {(k, kind): {} for k, kind, _ in blocks}
    for key, c in counts.items():
        v = key_to_int(key, width)
        for k, kind, qs in blocks:
            line = "static" if (v >> qs[0]) & 1 else "clear"
            o = line if kind == "listen" else ("minus" if (v >> qs[1]) & 1 else "plus") + "|" + line
            out[(k, kind)][o] = out[(k, kind)].get(o, 0.0) + float(c)
    return out


def fit(ps):
    """Least-squares fit of p(phi) = 1/2 (1 + V cos(theta - phi)) over the dials: V, theta."""
    n = len(ps)
    a = sum(2 / n * p * math.cos(phi(k)) for k, p in zip(DIALS, ps))
    b = sum(2 / n * p * math.sin(phi(k)) for k, p in zip(DIALS, ps))
    return 2 * math.hypot(a, b), math.degrees(math.atan2(b, a))


def rate(d, clear_keys):
    tot = sum(d.values())
    return (sum(d.get(c, 0.0) for c in clear_keys) / tot) if tot else 0.5


_RAN = []


def main():
    # Qollab may call main() itself after running the file; IonQ allows ONE job per run, so only run once.
    if _RAN:
        return
    _RAN.append(True)
    qc, blocks, width = build()
    name = getattr(backend, "name", None)  # noqa: F821  (Qollab pre-creates `backend`)
    name = name() if callable(name) else name
    print("The Last Call · one %d-qubit circuit × %d shots on %s" % (width, SHOTS, name))
    job = backend.run(qc, shots=SHOTS)  # noqa: F821
    try:
        print("job:", job.job_id())
    except Exception:
        pass
    counts = dict(job.result().get_counts())
    d = decode(counts, blocks, width)

    listen = [rate(d[(k, "listen")], ["clear"]) for k in DIALS]
    together = [rate(d[(k, "erase")], ["plus|clear", "minus|clear"]) for k in DIALS]
    plus = [rate({o: v for o, v in d[(k, "erase")].items() if o.startswith("plus")}, ["plus|clear"]) for k in DIALS]
    ideal = [(1 + math.sin(ALPHA) * math.cos(THETA - phi(k))) / 2 for k in DIALS]

    pc = lambda x: "%d%%" % round(100 * x)
    print()
    print("| | " + " | ".join("dial %d" % k for k in DIALS) + " |")
    print("|---|" + "|".join("---" for _ in DIALS) + "|")
    print("| Listen, measured | " + " | ".join(pc(x) for x in listen) + " |")
    print("| Listen, ideal | " + " | ".join(pc(x) for x in ideal) + " |")
    print("| Door recorded, all shots | " + " | ".join(pc(x) for x in together) + " |")
    print("| + group (record erased) | " + " | ".join(pc(x) for x in plus) + " |")
    vl, tl = fit(listen)
    vt, _ = fit(together)
    vp, tp = fit(plus)
    print()
    print("* Listening shows the fringe: fitted contrast %.2f (ideal 1.00) at phase %d°." % (vl, round(tl)))
    print("* Recording the door flattens it: fitted contrast %.2f (ideal 0)." % vt)
    print("* Erasing the record and sorting brings it back: + group contrast %.2f (ideal 1.00) at phase %d°." % (vp, round(tp)))
    print()
    print("Fitted contrast and phase: least-squares fit of the clear rate across the 8 dial settings to ½(1 + V·cos(θ − φ)).")


main()
