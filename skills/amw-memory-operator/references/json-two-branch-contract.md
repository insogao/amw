# JSON Two-Branch Contract

Keep trajectories simple and non-bloated.

## Branch Limit

Only two branches are allowed:

1. `steps` (normal branch, required)
2. `branches.challenge.steps` (challenge-handling branch, optional)

## Meaning of Challenge Branch

`challenge` means runtime blockers, for example:

- cookie/consent popups
- risk interstitial pages
- captcha/robot checks
- QR/login gates

It does not mean manual QA.

## Reserved Fields

Current runtime executes `steps` as primary path.  
The following fields are reserved for AI planning and future branch execution:

- `branch_policy.max_branches`
- `branch_policy.on_step_error`
- `branch_policy.on_challenge_error`
- `branches.challenge`

## Suggested Schema

```json
{
  "steps": [],
  "branches": {
    "challenge": {
      "enabled": true,
      "trigger": {
        "error_contains_any": ["captcha", "verification", "robot check", "risk"],
        "snapshot_contains_any": ["captcha", "verify", "confirm you are human"]
      },
      "steps": []
    }
  },
  "branch_policy": {
    "max_branches": 2,
    "on_step_error": "challenge",
    "on_challenge_error": "re_explore"
  }
}
```

## Compatibility

Legacy key `branches.human_verify` may still exist in old JSON.
When encountered, treat it as alias of `branches.challenge`.

## Practical Rule

- Keep `steps` runnable end-to-end.
- Keep challenge branch minimal: capture evidence, handoff/recover, then continue.
- If both normal and challenge branch fail, re-explore and patch only broken segment.
