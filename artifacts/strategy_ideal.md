# Strategy benchmark (ideal model, 2000 runs, seeds bench-0..)

Correct decision rate per night (saved Mira through the right door, or hung up on the mimic). ± is the 95% normal interval.

| Policy | Night 1 | Night 2 | Night 3 | Night 4 |
|---|---|---|---|---|
| guess (no calls) | 51.5% ±2.2 | 51.1% ±2.2 | 40.3% ±2.1 | 39.6% ±2.1 |
| trace every call | 50.6% ±2.2 | 49.4% ±2.2 | 48.8% ±2.2 | 50.5% ±2.2 |
| listen at Mira's dial 0 (+2 traces) | 100.0% ±0.0 | 100.0% ±0.0 | 80.7% ±1.7 | 63.9% ±2.1 |
| listen at the most informative dial (+1 trace) | 100.0% ±0.0 | 100.0% ±0.0 | 86.1% ±1.5 | 77.8% ±1.8 |
| listen at the most informative dial (+2 traces) | 100.0% ±0.0 | 100.0% ±0.0 | 84.2% ±1.6 | 76.9% ±1.8 |
| listen at the most informative dial (+3 traces) | 100.0% ±0.0 | 100.0% ±0.0 | 88.4% ±1.4 | 78.1% ±1.8 |
| adaptive: listen at the best dial until sure, then trace only if it's Mira | 100.0% ±0.0 | 100.0% ±0.0 | 87.6% ±1.4 | 77.5% ±1.8 |
| listen at the most informative dial (+4 traces) | 100.0% ±0.0 | 100.0% ±0.0 | 83.0% ±1.6 | 76.8% ±1.8 |
