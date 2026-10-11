"""Decode measured keys into game outcomes.

Classical bit 0 = q0 (0 clear, 1 static); bit 1 = q1 (trace only: 0 front, 1 side).
Keys may be bitstrings (Qiskit order: rightmost = bit 0, spaces allowed),
'0x..' hex strings or integers.
"""

OUTCOME_MAPPING_VERSION = "last-call-outcomes-v1"
LISTEN_OUTCOMES = ("clear", "static")
TRACE_OUTCOMES = ("front|clear", "front|static", "side|clear", "side|static")
ERASER_OUTCOMES = ("plus|clear", "plus|static", "minus|clear", "minus|static")


def key_to_int(key, width):
    if isinstance(key, bool):
        raise ValueError("bad key")
    if isinstance(key, int):
        v = key
    else:
        s = str(key).replace(" ", "").strip()
        if s.startswith("0x") or s.startswith("0X"):
            v = int(s, 16)
        else:
            if s.startswith("0b"):
                s = s[2:]
            if not s or any(c not in "01" for c in s):
                raise ValueError("bad key %r" % (key,))
            v = int(s, 2)
    if v < 0 or v >= (1 << width):
        raise ValueError("key %r outside a %d-bit register" % (key, width))
    return v


def classify(v, trace, eraser=False):
    line = "static" if v & 1 else "clear"
    if eraser:
        return ("minus" if (v >> 1) & 1 else "plus") + "|" + line
    if not trace:
        return line
    door = "side" if (v >> 1) & 1 else "front"
    return door + "|" + line


def decode_counts(counts, trace, eraser=False):
    """counts: {key: count or probability}. Returns {outcome: total}."""
    width = 2 if (trace or eraser) else 1
    out = {o: 0 for o in (ERASER_OUTCOMES if eraser else TRACE_OUTCOMES if trace else LISTEN_OUTCOMES)}
    for k, c in counts.items():
        c = float(c)
        if c < 0:
            raise ValueError("negative count")
        out[classify(key_to_int(k, width), trace, eraser)] += c
    if sum(out.values()) <= 0:
        raise ValueError("empty result")
    return out
