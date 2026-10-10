"""Run settings for The Last Call on Qollab. Edit, then press Run.

Every Run submits ONE batched job: for each of the 4 calls, 8 dial settings x
(listen, trace) = 64 small circuits (1 or 2 qubits). The game then replays the
measured shots, one shot per in-game call, each shot used at most once.
"""

# Shots per circuit. Must be at least the largest call budget (12) so a player
# can spend every call on a single dial setting.
SHOTS = 16

# How to label the results. "auto" guesses from the backend name; override
# with "ideal", "ionq_noise" or "device_noise" if the guess is wrong.
BACKEND_KIND = "auto"
