# State: MISS_OR_FAIL

Use this state when no confident hit exists or replay failed.

## Default Path: Auto-Probe

1. Run fallback/probe with `--disable-replay true`.
2. Keep browser headed for fast selector diagnosis.
3. Collect evidence in this order:
   1. `snapshot` (interactive/compressed structure)
   2. `eval_js` (precise DOM fields/attributes)
   3. `screenshot` only if above cannot answer
4. Patch only the failed segment in `trajectories/tmp/`.
5. Re-run one probe immediately.

## Required Probe Prelude (Do First)

Before changing selectors, add these two steps at the top of probe JSON:

```json
{
  "id": "probe_snapshot",
  "action": "snapshot",
  "value": "interactive",
  "params": { "save_as": "probe_snapshot" }
},
{
  "id": "probe_dom_scan",
  "action": "eval_js",
  "value": "return Array.from(document.querySelectorAll('input,textarea,button,a,[role=\"button\"]')).slice(0, 40).map((el) => ({ tag: el.tagName.toLowerCase(), id: el.id || '', name: el.getAttribute('name') || '', placeholder: el.getAttribute('placeholder') || '', aria: el.getAttribute('aria-label') || '', text: (el.innerText || '').trim().slice(0, 40) }));",
  "params": { "save_as": "probe_dom_scan" }
}
```

If these steps are missing, do not start screenshot-first debugging.

## JSON Editing Rules

1. Keep steps minimal and stable.
2. Externalize variable input using `{{vars.xxx}}`.
3. Keep `assert_*` checks at tail.
4. Keep branch count <= 2.

## Success Gate

1. `summary.mode` must be `explore`.
2. Acceptance checks must pass.
3. Artifacts must match expected path/content constraints.
