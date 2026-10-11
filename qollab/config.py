"""Run settings for The Last Call on Qollab. Edit, then press Run.

Every Run submits ONE batched job: for each of the 4 calls, 8 dial settings x
each tool that call allows (listen, trace, or the quantum eraser on the last
call; see data/nights.json) = 56 small circuits of 1 or 2 qubits. The game
then replays the measured shots, one shot per in-game call, each used once.
"""

# Shots per circuit. Must cover the largest call budget (10); more shots let
# you replay the same run more than once.
SHOTS = 16

# How to label the results. "auto" guesses from the backend name; override
# with "ideal", "ionq_noise" or "device_noise" if the guess is wrong.
BACKEND_KIND = "auto"
