# Theme 4 Demo Scenarios

All scenarios run against the authoritative simulation state and can be reproduced with a seed.

## 1. Single failure

Inject `R-027`, motor, critical, immediate. Expected result: the robot status changes, a prediction and failure event are recorded, and the evaluation dashboard updates cascade and mission metrics.

## 2. Cascading failure

Inject a critical failure with `progressive` timing. Expected result: prediction, propagation, and failure stages are visible in the recovery timeline.

## 3. Battery-constrained recovery

Inject a battery failure, then inspect the fleet reserve and capacity metrics before running migration.

## 4. Communication cascade

Inject communication failures on two different robots. Expected result: independent failure records and recomputed fleet availability.

## 5. Multiple simultaneous failures

Run a generated sequence with a fixed seed and 4 to 20 failures. The order and robot/type combinations are shown before execution.

## 6. Previously unseen sequence

Generate with a new seed. The sequence is stochastic, reproducible when the seed is retained, and is not selected from a hardcoded preset.

## 7. Progressive failure

Use progressive timing and inspect the timeline. The engine records intermediate prediction, propagation, and failure events instead of jumping directly to a final status.

## Benchmark

Run the same seeded sequence through the benchmark control. Baseline and Sentinel recovery results are computed from separate cloned snapshots; the benchmark does not mutate the live state.
