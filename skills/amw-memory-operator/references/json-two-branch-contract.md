# JSON 双分支约定

保持 trajectory 简洁，避免臃肿。

## 分支上限

只允许两个分支：

1. `steps`（正常分支，必需）
2. `branches.challenge.steps`（挑战处理分支，可选）

## Challenge 分支含义

`challenge` 指运行时阻断，例如：

- cookie/同意弹窗
- 风险中间页
- 验证码/真人校验
- 扫码/登录门槛

不表示手工 QA。

## 预留字段

当前 runtime 只执行主路径 `steps`。  
以下字段为 AI 规划与未来分支执行预留：

- `branch_policy.max_branches`
- `branch_policy.on_step_error`
- `branch_policy.on_challenge_error`
- `branches.challenge`

## 建议结构

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

## 兼容性

老 JSON 里可能仍存在 `branches.human_verify`。
遇到时按 `branches.challenge` 别名处理。

## 实务规则

- 保证 `steps` 可以端到端运行。
- challenge 分支保持最小：留证据、交接/恢复，然后回主流程。
- normal 与 challenge 都失败时，重新探索并只修补损坏片段。
