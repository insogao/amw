# 状态：MISS_OR_FAIL

当没有高置信命中，或 replay 失败时，使用此状态。

## 默认路径：Auto-Probe

1. 使用 `--disable-replay true` 运行 fallback/probe。
2. 浏览器保持有头模式，便于快速定位 selector 问题。
3. 收集 probe 证据包：
   1. `snapshot`（interactive/压缩结构，自动同步产出 json + png）
   2. `eval_js`（精确 DOM 字段/属性）
4. 仅修补 `trajectories/tmp/` 中失败片段。
5. 立即重跑一次 probe。

## 必需 Probe 前置（先做）

在改 selector 前，先把以下前置步骤放到 probe JSON 顶部：

```json
{
  "id": "probe_snapshot_capture",
  "action": "snapshot",
  "value": "interactive",
  "params": {
    "save_as": "probe_snapshot_data",
    "path": "./artifacts/probes/{{context.site}}_{{context.task_type}}_snapshot.json"
  }
},
{
  "id": "probe_interactive_scan",
  "action": "eval_js",
  "value": "return Array.from(document.querySelectorAll('input,textarea,button,a,[role=\"button\"]')).slice(0, 40).map((el) => ({ tag: el.tagName.toLowerCase(), id: el.id || '', name: el.getAttribute('name') || '', placeholder: el.getAttribute('placeholder') || '', aria: el.getAttribute('aria-label') || '', text: (el.innerText || '').trim().slice(0, 40) }));",
  "params": { "save_as": "interactive_elements" }
}
```

阅读顺序：

1. 先读 `*_snapshot.json`。
2. 仍不清晰再读 `*_screenshot.png`。

若缺少前置步骤，先不要改 selector。

## JSON 编辑规则

1. steps 保持最小且稳定。
2. 可变输入外置为 `{{vars.xxx}}`。
3. `assert_*` 校验放在尾部。
4. 分支数保持 <= 2。
5. 运行时 JSON 只放 `trajectories/tmp/`；禁止放 `.agents/skills/**`。
6. AMW 原生 action 可完成时，不创建外部脚本。

## 成功门槛

1. `summary.mode` 必须是 `explore`。
2. 验收检查必须通过。
3. artifacts 必须符合预期路径与内容约束。
