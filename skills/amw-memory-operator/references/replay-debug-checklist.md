# Replay Debug Checklist

When a run fails, follow this order:

1. Open `summary.json`.
2. Locate `failed_step_id`, `reason`, `mode`.
3. Open `events.jsonl`.
4. Find `step_error` for the same step.
5. Verify artifact output in `artifacts/`.

## Typical Fixes

- Selector timeout: broaden selector fallback or add wait.
- URL mismatch: add guard or correct navigation step.
- Missing data extraction: adjust `eval_js` selector/logic.
- Verification blocker: route to `human_handoff` and save evidence (prefer `copy_image_original`).

## Minimal-Patch Principle

- Patch only failed segment.
- Keep JSON variable-driven; avoid hardcoded user input.
- Keep solution AMW-native first; avoid external scripts unless approved or native action is missing.
- Re-run once in headed mode with hold:
  - `--headed true --hold-open-ms 30000`
