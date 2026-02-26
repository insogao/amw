# State: MISS_OR_FAIL

Use this state when no confident hit exists or replay failed.

## Default Path: Auto-Probe

1. Run fallback/probe with `--disable-replay true`.
2. Keep browser headed for fast selector diagnosis.
3. Collect probe evidence bundle:
   1. `snapshot` (interactive/compressed structure, saved to json)
   2. `screenshot` (full-page visual fallback, saved to png)
   3. `eval_js` (precise DOM fields/attributes)
4. Patch only the failed segment in `trajectories/tmp/`.
5. Re-run one probe immediately.

## Required Probe Prelude (Do First)

Before changing selectors, add these prelude steps at the top of probe JSON:

```json
{
  "id": "probe_snapshot",
  "action": "snapshot",
  "value": "interactive",
  "params": {
    "save_as": "probe_snapshot",
    "path": "./artifacts/probes/{{context.site}}_{{context.task_type}}_snapshot.json"
  }
},
{
  "id": "probe_screenshot",
  "action": "screenshot",
  "params": {
    "path": "./artifacts/probes/{{context.site}}_{{context.task_type}}_screenshot.png",
    "full_page": true
  }
},
{
  "id": "probe_dom_scan",
  "action": "eval_js",
  "value": "return Array.from(document.querySelectorAll('input,textarea,button,a,[role=\"button\"]')).slice(0, 40).map((el) => ({ tag: el.tagName.toLowerCase(), id: el.id || '', name: el.getAttribute('name') || '', placeholder: el.getAttribute('placeholder') || '', aria: el.getAttribute('aria-label') || '', text: (el.innerText || '').trim().slice(0, 40) }));",
  "params": { "save_as": "probe_dom_scan" }
}
```

Read order:

1. Read `*_snapshot.json` first.
2. If unclear, read `*_screenshot.png`.

If prelude steps are missing, do not patch selectors yet.

## JSON Editing Rules

1. Keep steps minimal and stable.
2. Externalize variable input using `{{vars.xxx}}`.
3. Keep `assert_*` checks at tail.
4. Keep branch count <= 2.
5. Keep runtime JSON under `trajectories/tmp/` only; never under `.agents/skills/**`.
6. Do not create external scripts if AMW native actions can complete the step.

## Success Gate

1. `summary.mode` must be `explore`.
2. Acceptance checks must pass.
3. Artifacts must match expected path/content constraints.
