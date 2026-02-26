# 状态：REPLAY

当检索在 `trajectories/ready/` 返回高置信命中时，使用此状态。

## 步骤

1. 用选中的 trajectory 执行 replay-first。
2. 检查 `summary.json` 的 mode/reason。
3. 成功则停止，不修改 JSON。
4. 失败则切换到 `MISS_OR_FAIL`。

## 检查项

1. 确认 `mode` 为 `replay`。
2. 若任务要求文件产物，确认输出 artifact 已生成。
3. replay 失败时记录 failed step id。
