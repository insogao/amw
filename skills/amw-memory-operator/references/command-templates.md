# 命令模板

## 列表/检索

`npm run amw -- list --store-dir ./data/<store>`

`npm run amw -- search --site <site> --task-type <task_type> --intent "<intent>" --store-dir ./data/<store>`

## Replay 优先运行

`npm run amw -- run --site <site> --task-type <task_type> --intent "<intent>" --fallback-steps-file ./trajectories/ready/<file>.json --store-dir ./data/<store> --session <session> --headed true --hold-open-ms 30000`

## Probe 运行（新 JSON 必须）

`npm run amw -- run --site <site> --task-type <task_type>_probe_v1 --intent "<intent>" --fallback-steps-file ./trajectories/tmp/<file>.json --store-dir ./data/<store> --disable-replay true --headed true`

规则：运行时生成的 probe JSON 必须存到 `trajectories/tmp/`，不能存到 `.agents/skills/**`。

说明：`--disable-replay true` 仅表示“跳过记忆命中，强制执行当前 fallback/probe JSON”，不是日志开关。

## 压缩 Probe 模板

起步模板：

`assets/json-demos/compressed-probe-skeleton.json`

复制为 `trajectories/tmp/<task>_probe.json`，在 probe 前置步骤之后追加任务专属步骤。

Probe 产物统一写入：

`./artifacts/probes/`

命名：

- `{{context.site}}_{{context.task_type}}_snapshot.json`
- `{{context.site}}_{{context.task_type}}_screenshot.png`

提示：`snapshot` 只要设置了 `path`，默认会自动产出上述两份文件，无需再单独加 `screenshot` 步骤。

## URL 下载（原生动作）

当 `eval_js` 已提取到图片 URL 时，使用 `download_url`，不要切外部 Python/Node 脚本。

示例步骤：

```json
{
  "id": "download_first_image",
  "action": "download_url",
  "value": "{{vars.image_urls.0}}",
  "params": {
    "path": "./artifacts/image_01.jpg",
    "save_as": "image_01_path"
  }
}
```

## 校验

`npm run amw -- validate --steps-file ./trajectories/tmp/<file>.json`

## 日志说明（默认开启）

不需要额外参数，`run` 默认写入运行日志：

- `data/<store>/runs/<run_id>/events.jsonl`
- `data/<store>/runs/<run_id>/summary.json`

## 手动 Observe（仅用户主动选择）

`npm run amw -- observe --site <site_or_url> --intent "<intent>" --store-dir ./data/<store> --trace-file ./data/<store>/traces/<name>.jsonl --headed true --observe-ms 60000`

## 可选 Trace 草稿

`npm run amw -- trace-to-json --trace-file ./data/<store>/traces/<name>.jsonl --site <site> --task-type <task_type> --intent "<intent>" --output-steps-file ./trajectories/tmp/<file>.json`

## Grep 优先检索

`rg -n --glob "*.json" "\"amw_match_line\"\\s*:\\s*\".*\"" trajectories/ready | rg -i "amw" | rg -i "site:<domain>" | rg -i "task:<task_type>" | rg -i "<keyword_or_zh_keyword>"`
