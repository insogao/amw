# State: REPLAY

Use this state when retrieval returns a confident hit in `trajectories/ready/`.

## Steps

1. Run replay-first with selected trajectory.
2. Inspect `summary.json` mode/reason.
3. If success, stop; do not modify JSON.
4. If failed, switch to `MISS_OR_FAIL`.

## Checks

1. Confirm `mode` is `replay`.
2. Confirm output artifact exists if task expects files.
3. Record failed step id when replay fails.

