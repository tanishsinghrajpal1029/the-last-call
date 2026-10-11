"""Run settings for The Last Call on Qollab. Edit, then press Run.

Every Run submits ONE batched job: for each of the 4 calls, 8 dial settings x
(listen, trace) = 64 small circuits, plus 8 eraser circuits for the bonus
scene: 72 circuits of 1 or 2 qubits. The game then replays the
measured shots, one shot per in-game call, each shot used at most once.
"""

# Shots per circuit. Must cover the largest call budget (12) and the bonus
# scene's 3 sweeps x 8 shots (24) at one dial setting.
SHOTS = 24

# How to label the results. "auto" guesses from the backend name; override
# with "ideal", "ionq_noise" or "device_noise" if the guess is wrong.
BACKEND_KIND = "auto"
