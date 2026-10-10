# Strategy benchmark (illustrative noise model, 2000 runs, seeds bench-0..)

Correct decision rate per night (saved Mira through the right door, or hung up on the mimic). ± is the 95% normal interval.

| Policy | Night 1 | Night 2 | Night 3 | Night 4 |
|---|---|---|---|---|
| guess (no calls) | 51.5% ±2.2 | 51.1% ±2.2 | 40.3% ±2.1 | 39.6% ±2.1 |
| trace every call | 50.6% ±2.2 | 49.4% ±2.2 | 48.2% ±2.2 | 50.5% ±2.2 |
| listen at Mira's dial 0 (+2 traces) | 100.0% ±0.0 | 100.0% ±0.0 | 79.5% ±1.8 | 63.3% ±2.1 |
| listen at the most informative dial (+1 trace) | 100.0% ±0.0 | 100.0% ±0.0 | 85.4% ±1.5 | 76.7% ±1.9 |
| listen at the most informative dial (+2 traces) | 100.0% ±0.0 | 100.0% ±0.0 | 83.0% ±1.6 | 75.8% ±1.9 |
| listen at the most informative dial (+3 traces) | 100.0% ±0.0 | 100.0% ±0.0 | 87.3% ±1.5 | 77.3% ±1.8 |
| adaptive: listen at the best dial until sure, then trace only if it's Mira | 98.1% ±0.6 | 98.6% ±0.5 | 86.6% ±1.5 | 76.3% ±1.9 |
| listen at the most informative dial (+4 traces) | 100.0% ±0.0 | 100.0% ±0.0 | 82.0% ±1.7 | 75.8% ±1.9 |
