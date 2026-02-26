# Replay 调试检查单

当运行失败时，按以下顺序排查：

1. 打开 `summary.json`。
2. 定位 `failed_step_id`、`reason`、`mode`。
3. 打开 `events.jsonl`。
4. 找到同一步骤对应的 `step_error`。
5. 校验 `artifacts/` 里的输出产物。

## 常见修复

- Selector 超时：放宽选择器兜底或补 `wait`。
- URL 不匹配：增加 guard 或修正导航步骤。
- 数据抽取缺失：调整 `eval_js` 的 selector/逻辑。
- 验证阻断：转 `human_handoff` 并保存证据（优先 `copy_image_original`）。

## 最小修补原则

- 只修补失败片段。
- JSON 保持变量驱动，避免硬编码用户输入。
- 优先 AMW 原生方案；除非已批准或原生能力缺失，不走外部脚本。
- 有头模式重跑一次并保留窗口：
  - `--headed true --hold-open-ms 30000`
