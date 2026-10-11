# Strategy benchmark (illustrative noise model, 2000 runs, seeds bench-0..)

Correct decision rate per night (saved Mira through the right door, or hung up on the mimic). ± is the 95% normal interval.

| Policy | Night 1 | Night 2 | Night 3 | Night 4 |
|---|---|---|---|---|
| guess (no calls) | 51.5% ±2.2 | 51.1% ±2.2 | 40.3% ±2.1 | 39.6% ±2.1 |
| trace every call | 50.6% ±2.2 | — (Trace not available on this call) | 50.2% ±2.2 | 49.9% ±2.2 |
| WHO calls at Mira's dial 0 (+2 traces) | 100.0% ±0.0 | 94.7% ±1.0 | 85.4% ±1.5 | 78.6% ±1.8 |
| WHO calls at the most informative dial (+1 trace) | 100.0% ±0.0 | 94.0% ±1.0 | 85.0% ±1.6 | 84.4% ±1.6 |
| WHO calls at the most informative dial (+2 traces) | 100.0% ±0.0 | 94.0% ±1.0 | 85.0% ±1.6 | 83.5% ±1.6 |
| WHO calls at the most informative dial (+3 traces) | 100.0% ±0.0 | 94.0% ±1.0 | 86.4% ±1.5 | 87.8% ±1.4 |
| adaptive: WHO calls at the best dial until sure, then trace only if it's Mira | 98.1% ±0.6 | 93.3% ±1.1 | 86.0% ±1.5 | 88.2% ±1.4 |
| WHO calls at the most informative dial (+4 traces) | 100.0% ±0.0 | 94.0% ±1.0 | 81.8% ±1.7 | 86.0% ±1.5 |
