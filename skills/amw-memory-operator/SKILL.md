---
name: amw-memory-operator
description: Operate and evolve agent-memory-workbench with replay-first memory, minimal JSON edits, and a strict two-branch policy (normal + human-verification).
---

# AMW Memory Operator

Use this skill when the user wants to run, debug, or evolve browser automation in `agent-memory-workbench`.

## Scope

- Replay-first execution from stored trajectories
- Fallback exploration and trajectory persistence
- Artifact extraction (markdown, screenshot, image copy, QR capture)
- Run-log based debugging with minimal JSON edits

## Operating Sequence (Required)

Follow this order; do not skip steps:

1. Bootstrap runtime (clone/install) if project is missing.
2. Search reusable trajectories in `trajectories/ready/`.
3. If no confident hit, run Observe-First before writing any new JSON.
4. Create/modify trajectory only in `trajectories/tmp/`.
5. Validate and probe with `--disable-replay true`.
6. Promote to `trajectories/ready/` only after repeated success.

Success gate for new trajectory verification:

1. `summary.mode` must be `explore` (not `replay`).
2. Acceptance checks (`assert_*`) must pass.
3. Output artifacts must match expected file/path/content constraints.

Do not mark a new trajectory as verified if run mode is `replay`.

## Observe-First (Required on Miss)

If retrieval misses or candidate confidence is low, collect evidence first:

1. Start live trace via `observe` (synchronous logging during operation).
2. Perform task manually or semi-manually in headed browser.
3. AI reads trace and writes/patches JSON in `trajectories/tmp/`.
4. Use `trace-to-json` only as fallback when trace is too noisy.

Only after this evidence is collected, write new JSON in `trajectories/tmp/`.

## Trajectory Governance (Required)

Directory policy (do not mix):

1. `examples/` (optional local)
Local-only scratch examples; not distributed from Git by default.
2. `trajectories/ready/`
User-verified reusable trajectories. This is the primary grep/search target.
3. `trajectories/tmp/`
AI-generated or in-test trajectories. Temporary only. Do not treat as stable memory.
4. `trajectories/archive/`
Deprecated but kept versions for rollback/reference.

Lifecycle policy:

1. New trajectory starts in `trajectories/tmp/`.
2. Run `validate` and execute with `--disable-replay true`.
3. After repeated success, promote to `trajectories/ready/`.
4. If replaced, move old version to `trajectories/archive/`.

Hard constraints:

1. Do not create new user-generated JSON directly under `examples/` for distribution.
2. Do not commit temporary trajectories from `trajectories/tmp/`.
3. If a JSON is created in the wrong place, move it and explain the move.
4. Keep Baidu download experiments local-only in `trajectories/tmp/` (do not distribute under `examples/`).

ACK protocol before generating/modifying trajectory files:

`Governance ACK: new JSON -> trajectories/tmp, reusable JSON -> trajectories/ready, grep default -> trajectories/ready.`

## Hard Rule: Max Two Branches

Only allow:

1. Normal branch
2. Human-verification branch (captcha/QR/real-person check)

Do not introduce multi-level branch trees unless the user explicitly asks.

## Resource Map

- Contract and reserved branch schema: `references/json-two-branch-contract.md`
- Replay/debug checklist: `references/replay-debug-checklist.md`
- JSON demos: `assets/json-demos/*.json`
- Skill UI metadata: `agents/openai.yaml`
- Reusable trajectories: `trajectories/ready/**/*.json`
- Temporary trajectories: `trajectories/tmp/*.json`

Always copy the nearest demo JSON from `assets/json-demos/` and minimally adapt selectors/vars.

## Install / Run

### Runtime Bootstrap (Required Before First Use)

If `agent-memory-workbench` is missing in current workspace, bootstrap runtime first.

PowerShell:

`if (!(Test-Path ./agent-memory-workbench/package.json)) { git clone https://github.com/insogao/amw.git agent-memory-workbench }`

Install dependencies:

`npm --prefix ./agent-memory-workbench install`

### Local

1. `cd <your-workspace>/agent-memory-workbench`
2. `npm install`
3. Use:
   - `npm run amw -- list --store-dir ./data`
   - `npm run amw -- run ...`
   - `npm run amw -- validate --steps-file ./trajectories/tmp/<file>.json`

If running outside project root:

`npm --prefix <path-to-agent-memory-workbench> run amw -- <command>`

Example from parent workspace:

`npm --prefix ./agent-memory-workbench run amw -- <command>`

Profile defaults to `main` (persistent login identity). Use `--profile <name>` to switch identities.
Browser mode defaults to `headed=true` (visible browser window). Use `--headed false` only when the user explicitly asks for headless.
Use `--disable-replay true` when validating new fallback steps and you need to bypass memory hits.

### Headed debug mode

Use:

`--headed true --hold-open-ms 30000`

### Optional npx distribution (future)

Current mode is local-first. For distribution later:

1. Publish package with `bin` pointing to `src-node/cli.js`
2. Keep runtime dependency on `agent-browser`
3. Run via `npx <your-package> run ...`

## Core Paths

- CLI: `src-node/cli.js`
- Adapter/actions: `src-node/agentBrowserAdapter.js`, `src-node/actionRegistry.js`
- Reusable trajectories: `trajectories/ready/`
- Temporary trajectories: `trajectories/tmp/`
- Archived trajectories: `trajectories/archive/`
- Artifacts: `artifacts/`
- Runs: `data/<store>/runs/<run_id>/events.jsonl` and `summary.json`
- Observe traces: `data/<store>/traces/*.jsonl`
- Memory DB: `data/<store>/memory.db`

## Meta Capabilities (JSON Actions)

- Navigation/input: `open`, `click`, `click_text`, `fill`, `type`, `press`, `wait`
- Extraction: `eval_js`, `get_url`, `snapshot`
- Image/text ops:
  - `copy_text`, `paste_text`
  - `copy_image` (element/clip screenshot)
  - `copy_image_original` (prefer original image bytes)
  - `paste_image`
- Output/validation:
  - `write_markdown`, `append_markdown_section`
  - `assert_markdown`, `assert_file`
- Human takeover: `human_handoff`

Screenshot granularity:

1. Full page (`full_page: true`)
2. Selector crop (`selector`)
3. Coordinate crop (`clip: {x,y,width,height}`)

Prefer `copy_image_original` whenever the user asks to "save original image" rather than screenshot.

## Retrieval and Replay Workflow

1. Normalize intent into `{site, task_type, intent, vars}`
2. Run replay-first
3. If replay misses/fails, run fallback steps
4. On success, persist trajectory
5. Compare `summary.json` `mode` and latency (`replay` vs `explore`)
6. For grep-first manual selection, search `trajectories/ready/` first.

## JSON Editing Policy

1. Edit the smallest possible segment
2. Keep selectors stable and robust
3. Keep variable input externalized (`{{vars.xxx}}`)
4. Keep branch count <= 2
5. Keep `assert_*` checks at the tail

### Single-Line Match Field (Required)

For grep-first low-token retrieval, each JSON should include one reserved single-line field:

```json
"amw_match_line": "amw site:example.com task:example_task flow:example_v1 key:foo key:bar key:<zh_keyword>"
```

Strict rules:

1. `amw_match_line` must stay on one physical line (no `\n` or wrapped multi-line values).
2. Use ASCII tags only: `site:`, `task:`, `flow:`, `key:`.
3. Chinese is allowed in `key:` values when files are UTF-8 encoded.
4. Do not remove `amw` anchor token.
5. Prefer adding new `key:` tokens instead of changing `flow:` unless behavior truly changes.

For human verification:

1. Detect blocker (`eval_js` or error symptoms)
2. Save required artifact (`copy_image_original` preferred)
3. Pause with `human_handoff`
4. Resume normal flow

For reserved branch fields, follow `references/json-two-branch-contract.md`.

## Debug Protocol

On failure, inspect in order:

1. `summary.json` (`failed_step_id`, `reason`, `mode`)
2. `events.jsonl` (`step_error`, timeout, guard failure)
3. Artifact correctness in `artifacts/`

Patch only the failed segment, then re-run once in headed mode.
For fallback verification, add `--disable-replay true` so replay memory does not mask issues.

Replay-mask prevention checklist:

1. For new JSON probing, always pass `--disable-replay true`.
2. Prefer probe task type suffix (for example `*_probe_v2`) during iteration.
3. Verify `summary.mode == "explore"` before claiming test success.
4. Avoid static artifact filenames during probes; include run-specific suffix when possible.

## Anti-Patterns (Do Not Do)

1. Do not write trajectory JSON before Observe-First evidence is captured.
2. Do not treat a successful `replay` run as proof that new fallback JSON works.
3. Do not keep patching many unrelated steps at once; patch minimum failed segment.
4. Do not promote tmp trajectory to ready after a single lucky run.

## Command Templates

Run:

`npm run amw -- run --site <site> --task-type <task_type> --intent "<intent>" --fallback-steps-file ./trajectories/ready/<file>.json --store-dir ./data/<store> --session <session> --headed true --hold-open-ms 30000`

Run (force fallback):

`npm run amw -- run --site <site> --task-type <task_type> --intent "<intent>" --fallback-steps-file ./trajectories/tmp/<file>.json --store-dir ./data/<store> --disable-replay true`

Run probe (recommended for new JSON):

`npm run amw -- run --site <site> --task-type <task_type>_probe_v1 --intent "<intent>" --fallback-steps-file ./trajectories/tmp/<file>.json --store-dir ./data/<store> --disable-replay true --headed true`

Validate JSON:

`npm run amw -- validate --steps-file ./trajectories/tmp/<file>.json`

Observe-first trace capture:

`npm run amw -- observe --site <site_or_url> --intent "<intent>" --store-dir ./data/<store> --trace-file ./data/<store>/traces/<name>.jsonl --headed true`

Compile trace to JSON draft:

`npm run amw -- trace-to-json --trace-file ./data/<store>/traces/<name>.jsonl --site <site> --task-type <task_type> --intent "<intent>" --output-steps-file ./trajectories/tmp/<file>.json`

Note:
`trace-to-json` is an emergency bootstrap tool, not mandatory. Default is AI direct trace review.

Inspect:

- `npm run amw -- list --store-dir ./data/<store>`
- `npm run amw -- search --site <site> --task-type <task_type> --intent "<intent>" --store-dir ./data/<store>`

Grep-first retrieval (AND by chain):

`rg -n --glob "*.json" "\"amw_match_line\"\\s*:\\s*\".*\"" trajectories/ready | rg -i "amw" | rg -i "site:<domain>" | rg -i "task:<task_type>" | rg -i "<keyword_or_zh_keyword>"`
