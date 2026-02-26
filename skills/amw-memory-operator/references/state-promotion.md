# 状态：PROMOTION

当 probe 运行成功，且该 trajectory 可作为候选可复用记忆时，使用此状态。

## 目录治理

1. 进行中：`trajectories/tmp/`
2. 可复用：`trajectories/ready/`
3. 历史归档：`trajectories/archive/`
4. 仅示例（可读不可写运行时文件）：`examples/`

## 提升步骤

1. 校验 JSON。
2. 用 `--disable-replay true` 进行 probe。
3. 再重跑一次做稳定性确认。
4. 将 tmp 提升到 ready。
5. 被替换的 ready 移动到 archive。

## ACK 行

`Governance ACK: new JSON -> trajectories/tmp, reusable JSON -> trajectories/ready, grep default -> trajectories/ready.`
