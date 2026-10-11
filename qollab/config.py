"""Run settings for The Last Call on Qollab. Edit, then press Run.

Every Run submits ONE job. On simulators that accept a batch: for each of the
4 calls, 8 dial settings x each tool that call allows (listen, trace, or the
quantum eraser on the last call; see data/nights.json) = 56 small circuits of
1 or 2 qubits, and the game replays the measured shots, one per in-game call.

IonQ backends accept one circuit per run, so there the page sends ONE
24-qubit circuit instead: call 1's settings listened to at all 8 dials
(8 qubits) and erased at all 8 dials (8 pairs = 16 qubits), measured together.
"""

# Shots per circuit. Must cover the largest call budget (10); more shots let
# you replay the same run more than once.
SHOTS = 16

# IonQ (one circuit per run): shots for the single 24-qubit circuit, and which
# dial settings to pack into it (8 dials -> 8 + 16 = 24 qubits; Aria has 25).
IONQ_SHOTS = 100
IONQ_DIALS = [0, 1, 2, 3, 4, 5, 6, 7]
# "auto": one circuit on IonQ backends, the batch elsewhere. True / False forces it.
SINGLE_CIRCUIT = "auto"

# How to label the results. "auto" guesses from the backend name; override
# with "ideal", "ionq_noise" or "device_noise" if the guess is wrong.
BACKEND_KIND = "auto"
