---
name: amw-memory-operator
description: Operate and evolve agent-memory-workbench with replay-first browser memory. Use for trajectory retrieval, probe/debug, trace review, and minimal JSON patching under a strict two-branch policy (normal + challenge-handling).
---

# AMW Memory Operator

Skill Version: `v0.1.2`

## Mission

Run browser tasks with this priority:

1. Reuse existing trajectory.
2. If miss/fail, auto-probe with compressed evidence.
3. Patch minimal JSON in `trajectories/tmp/`.
4. Promote to `trajectories/ready/` only after repeated success.

## Hard Rules

1. Max two branches only: `normal` + `challenge-handling`.
2. Default mode is autonomous probe, not manual observe.
3. Manual `observe` requires explicit user approval first.
4. Probe evidence bundle is required: generate both `snapshot.json` and `screenshot.png`, then read snapshot first.
5. New/temporary JSON must stay in `trajectories/tmp/`.

Probe evidence naming/location:

1. Directory: `./artifacts/probes/`
2. Snapshot file: `{{context.site}}_{{context.task_type}}_snapshot.json`
3. Screenshot file: `{{context.site}}_{{context.task_type}}_screenshot.png`

## State Machine (Read by Current State)

1. State `REPLAY`: you have a confident trajectory hit.
Read: `references/state-replay.md`

2. State `MISS_OR_FAIL`: no hit or replay failed.
Read: `references/state-miss-or-fail.md`

3. State `CHALLENGE_BLOCKER`: popup/captcha/QR/risk-interstitial block.
Read: `references/state-challenge-blocker.md`

4. State `PROMOTION`: probe succeeded and ready for reuse.
Read: `references/state-promotion.md`

## Resource Map

- Two-branch contract: `references/json-two-branch-contract.md`
- Replay/debug checklist: `references/replay-debug-checklist.md`
- Command templates: `references/command-templates.md`
- JSON demos: `assets/json-demos/*.json`
  - For compressed-first probing, start from `assets/json-demos/compressed-probe-skeleton.json`
- Reusable trajectories: `trajectories/ready/**/*.json`
- Temporary trajectories: `trajectories/tmp/*.json`

## Runtime Bootstrap

If missing project:

`if (!(Test-Path ./agent-memory-workbench/package.json)) { git clone https://github.com/insogao/amw.git agent-memory-workbench }`

Install:

`npm --prefix ./agent-memory-workbench install`

## Execution Defaults

1. Browser defaults to headed (`headed=true`).
2. Use profile `main` unless user requests another identity.
3. For new JSON verification, always pass `--disable-replay true`.

## Minimal Workflow

1. Search/select trajectory from `trajectories/ready/`.
2. Run replay-first.
3. On miss/fail, run probe in headed mode with `--disable-replay true`.
4. Fix only failed segment in `trajectories/tmp/`.
5. Validate, rerun, then promote.

## Anti-Patterns

1. Entering `observe` without user approval.
2. Treating replay success as proof of new fallback JSON.
3. Screenshot-only debugging without snapshot/eval_js prelude.
4. Writing user-generated JSON directly into `examples/`.

## Clarification

`challenge-handling` means runtime blockers (consent dialog, risk prompt, captcha, QR gate).
It does not mean "human code review" or "manual QA".
