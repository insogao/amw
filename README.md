# Agent Memory Workbench

Standalone sandbox for building a memory-driven browser automation agent.

This folder is intentionally isolated from:
- `../Clawome`
- `../agent-browser`

No source files are modified in those projects.

## Goal

Build a reusable execution loop:

1. Try replaying a previously successful trajectory.
2. Validate each step with guards.
3. If replay fails, fallback to exploratory steps.
4. Save successful exploration as a new trajectory version.
5. Keep structured run logs for later summarization.

## Architecture

- `MemoryStore` (SQLite): stores trajectories and execution stats.
- `HybridRetriever`: finds candidate trajectories with hard filters + lexical + semantic-lite score.
- `AgentBrowserAdapter`: wraps `agent-browser` SDK (`dist/browser.js`) directly.
- `ActionRegistry`: action dispatch table (`action -> handler`) for JSON-driven tasks.
- `TrajectoryExecutor`: replays steps, checks guards, supports human handoff.
- `RunLogger`: writes JSONL events and run summary.
- `Orchestrator`: replay-first, fallback-explore-second.

`memory.db` is actively used for trajectory storage + replay stats (`usage_count`, `success_rate`, `avg_latency_ms`).

## Framework Contract

This project is intentionally **configuration-driven**:

- Add new tasks by writing JSON steps.
- Do not change core engine code for each new task.
- AI should focus on intent matching and fixing failed trajectories.
- Successful paths are persisted as reusable JSON memory.

## Trajectory Directories

Use these directories with clear roles:

- `examples/`: optional local scratch examples (not distributed by default).
- `trajectories/ready/`: user-verified reusable trajectories (primary search target).
- `trajectories/tmp/`: temporary AI-generated or test trajectories.
- `trajectories/archive/`: historical versions kept for rollback.

Recommended flow:

1. Create new trajectory in `trajectories/tmp/`.
2. Validate and run with `--disable-replay true`.
3. Promote successful trajectory to `trajectories/ready/`.
4. Move replaced old version to `trajectories/archive/`.

## JSON Actions

Current built-in actions:

- `open`, `click`, `click_text`, `fill`, `type`, `press`
- `wait`, `snapshot`, `get_url`
- `screenshot`, `assert_file`
- `copy_text`, `copy_image`, `copy_image_original`, `paste_text`, `paste_image`
- `eval_js` (extract structured data from page)
- `write_markdown`, `append_markdown_section` (persist extracted data as `.md`)
- `assert_markdown` (acceptance check)
- `human_handoff` (pause for manual login/QR)

Use `params.save_as` to persist an action result into runtime variables and reuse it later.

Screenshot/copy-image supports three granularities:
- Full page: `{"action":"screenshot","params":{"path":"...","full_page":true}}`
- Element region: `{"action":"screenshot","params":{"path":"...","selector":"#target"}}`
- Coordinate region: `{"action":"screenshot","params":{"path":"...","clip":{"x":100,"y":200,"width":300,"height":220}}}`

For image preservation, prefer original-source copy:
- `{"action":"copy_image_original","target":"img#qr","params":{"path":"./artifacts/qr.png"}}`
- Or `copy_image` with `{"mode":"original"}` when selector is available.

## Parametric Reuse (Important)

Keep flow stable in JSON, inject variable inputs at runtime.

Example step:

```json
{
  "id": "fill_query",
  "action": "fill",
  "target": "textarea[name='q']",
  "value": "{{vars.query}}"
}
```

Run with different queries without changing trajectory JSON:

```bash
npm run amw -- run ^
  --site google.com ^
  --task-type web_search ^
  --intent "search on google" ^
  --fallback-steps-file ./trajectories/tmp/google_search_parametric.json ^
  --query "刘亦菲 照片"
```

Variable input options:
- `--query <text>` (shortcut to `vars.query`)
- `--vars-file <path>` JSON object
- `--vars-json '{"query":"...","lang":"..."}'`

## Grep-First Matching Contract (Low Token)

To reduce token usage, reserve one single-line field in each trajectory JSON:

```json
"amw_match_line": "amw site:hotmail.com task:send_email flow:compose_send_v1 key:send key:email key:<zh_keyword>"
```

Rules:
- Keep this field on one physical line. Do not add line breaks.
- Keep stable machine tags in ASCII: `site:`, `task:`, `flow:`, `key:`.
- Chinese is supported in `key:` values when files are UTF-8 encoded.
- Put reusable intent words in `key:` values (English + Chinese synonyms).

PowerShell search (AND by chained `rg` filters):

```powershell
rg -n --glob "*.json" "\"amw_match_line\"\\s*:\\s*\".*\"" trajectories/ready `
| rg -i "amw" `
| rg -i "site:hotmail\\.com" `
| rg -i "task:send_email" `
| rg -i "key:send|key:<zh_keyword>"
```

This returns only lines/files matching all required filters.

## Example Use Cases

- Keep runnable user trajectories under `trajectories/ready/` (reusable) and `trajectories/tmp/` (in-progress).
- Keep `examples/` only as optional local scratch, not as distribution contract.

## Quick Start

1. Ensure `agent-browser` is available on PATH.
2. Node.js 22+ is required.
3. Run from this folder:

```bash
npm run amw -- list --store-dir ./data
```

3. Record a trajectory from a steps file:

```bash
npm run amw -- record ^
  --site google.com ^
  --task-type web_search ^
  --intent "search openai news" ^
  --steps-file ./trajectories/tmp/google_search_steps.json ^
  --store-dir ./data ^
  --session amw-demo
```

4. Run replay-first with fallback:

```bash
npm run amw -- run ^
  --site google.com ^
  --task-type web_search ^
  --intent "search openai news" ^
  --fallback-steps-file ./trajectories/tmp/google_search_steps.json ^
  --store-dir ./data ^
  --session amw-demo
```

5. Validate steps JSON before execution:

```bash
npm run amw -- validate --steps-file ./trajectories/tmp/baidu_liuyifei_download_2photos.json
```

6. Force fallback exploration (skip replay) when debugging:

```bash
npm run amw -- run ... --disable-replay true
```

## Human Handoff

Add a `human_handoff` step in your steps file:

```json
{
  "id": "login_qr",
  "action": "human_handoff",
  "value": "Please complete QR login in browser, then press Enter."
}
```

Execution pauses and waits for user confirmation before continuing.

## Node.js Source

- CLI: `src-node/cli.js`
- Core modules: `src-node/*.js`
- Tests: `tests-node/*.test.js`
- Config example: `amw.config.example.json`

## Headed / Headless

Without any config, AMW defaults to `headed=true` (visible browser).

Set default behavior in `amw.config.json`:

```json
{
  "headed": true,
  "hold_open_ms": 30000,
  "profile": "main",
  "profile_dir": "./profiles"
}
```

You can still override via CLI:

```bash
npm run amw -- run ... --headed false
npm run amw -- run ... --headed true --hold-open-ms 30000
npm run amw -- run ... --disable-replay true
npm run amw -- run ... --profile main
```

`hold_open_ms` is useful for visible/manual workflows (QR login, human takeover), so the browser does not close immediately after steps finish.

`profile` controls persistent browser identity (cookies/localStorage/login state). Reusing the same profile preserves login across runs.

`session` is still a task/run label for orchestration and logs; it is not the browser identity container.

Run tests:

```bash
npm test
```

No API key is required for deterministic replay/explore runs.
An API key is only needed if you later add LLM planning or embeddings.

## Notes on SQLite Warning

AMW currently uses Node's built-in `node:sqlite` API for `memory.db`.
`npm run amw` and `npm test` now use `--no-warnings`, so ExperimentalWarning is hidden by default.
