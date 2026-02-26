# State: PROMOTION

Use this state when probe run succeeded and trajectory is candidate reusable memory.

## Directory Governance

1. In progress: `trajectories/tmp/`
2. Reusable: `trajectories/ready/`
3. Historical: `trajectories/archive/`
4. Demo-only (read reference, do not write runtime files): `examples/`

## Promotion Steps

1. Validate JSON.
2. Probe with `--disable-replay true`.
3. Re-run once for stability.
4. Promote tmp -> ready.
5. Move replaced ready -> archive.

## ACK Line

`Governance ACK: new JSON -> trajectories/tmp, reusable JSON -> trajectories/ready, grep default -> trajectories/ready.`
