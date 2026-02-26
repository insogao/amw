# Command Templates

## List/Search

`npm run amw -- list --store-dir ./data/<store>`

`npm run amw -- search --site <site> --task-type <task_type> --intent "<intent>" --store-dir ./data/<store>`

## Replay-First Run

`npm run amw -- run --site <site> --task-type <task_type> --intent "<intent>" --fallback-steps-file ./trajectories/ready/<file>.json --store-dir ./data/<store> --session <session> --headed true --hold-open-ms 30000`

## Probe Run (Required for New JSON)

`npm run amw -- run --site <site> --task-type <task_type>_probe_v1 --intent "<intent>" --fallback-steps-file ./trajectories/tmp/<file>.json --store-dir ./data/<store> --disable-replay true --headed true`

## Compression Probe Template

Start from:

`assets/json-demos/compressed-probe-skeleton.json`

Copy it to `trajectories/tmp/<task>_probe.json`, then append task-specific steps after probe prelude.

## Validate

`npm run amw -- validate --steps-file ./trajectories/tmp/<file>.json`

## Manual Observe (Opt-In Only)

`npm run amw -- observe --site <site_or_url> --intent "<intent>" --store-dir ./data/<store> --trace-file ./data/<store>/traces/<name>.jsonl --headed true --observe-ms 60000`

## Optional Trace Draft

`npm run amw -- trace-to-json --trace-file ./data/<store>/traces/<name>.jsonl --site <site> --task-type <task_type> --intent "<intent>" --output-steps-file ./trajectories/tmp/<file>.json`

## Grep-First Retrieval

`rg -n --glob "*.json" "\"amw_match_line\"\\s*:\\s*\".*\"" trajectories/ready | rg -i "amw" | rg -i "site:<domain>" | rg -i "task:<task_type>" | rg -i "<keyword_or_zh_keyword>"`
