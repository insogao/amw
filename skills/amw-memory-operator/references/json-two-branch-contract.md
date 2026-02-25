# JSON Two-Branch Contract

Use this contract to keep trajectories simple and non-bloated.

## Branch Limit

Only two branches are allowed:

1. `steps` (normal branch, required)
2. `branches.human_verify.steps` (human-verification branch, optional)

## Reserved Fields

Current runtime executes `steps` as primary path.  
The following fields are reserved for AI planning and future runtime branch execution:

- `branch_policy.max_branches`
- `branch_policy.on_step_error`
- `branch_policy.on_human_verify_error`
- `branches.human_verify`

## Suggested Schema

```json
{
  "steps": [],
  "branches": {
    "human_verify": {
      "enabled": true,
      "trigger": {
        "error_contains_any": ["captcha", "verification", "二维码", "robot check"],
        "snapshot_contains_any": ["验证码", "请完成验证"]
      },
      "steps": []
    }
  },
  "branch_policy": {
    "max_branches": 2,
    "on_step_error": "human_verify",
    "on_human_verify_error": "re_explore"
  }
}
```

## Practical Rule

- Keep `steps` runnable end-to-end.
- Keep `branches.human_verify.steps` minimal: capture evidence, handoff, then continue.
- If both normal and human_verify fail, AI should re-explore and rewrite only the broken segment.

