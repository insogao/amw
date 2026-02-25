#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { AgentBrowserAdapter } from "./agentBrowserAdapter.js";
import { RunLogger } from "./logger.js";
import { MemoryStore } from "./memoryStore.js";
import { MemoryOrchestrator } from "./orchestrator.js";
import { HybridRetriever } from "./retrieval.js";
import { TrajectoryExecutor } from "./trajectoryExecutor.js";
import { loadConfig, resolveBoolOption, resolveNumberOption, resolveStringOption } from "./config.js";
import { buildTrajectory, normalizeStep } from "./types.js";
import { domainFromSiteOrUrl, shortId } from "./utils.js";

function printHelp() {
  process.stdout.write(`
Agent Memory Workbench (Node.js)

Usage:
  amw <command> [options]
  node src-node/cli.js <command> [options]

Commands:
  list        List stored trajectories
  search      Search trajectory memory
  record      Execute steps and save successful trajectory
  validate    Validate a trajectory JSON/steps file
  run         Replay-first run with optional fallback exploration

Common options:
  --store-dir <path>   Default: ./data
  --site <value>
  --task-type <value>
  --intent <value>
  --session <name>     Default: amw
  --profile <name>     Browser identity profile (default: main)
  --profile-dir <path> Profile root dir (default: ./profiles)
  --binary <path>      Default: agent-browser
  --headed <bool>      Default: true
  --disable-replay <bool> Skip memory replay and force fallback steps
  --hold-open-ms <n>   Keep browser open for N ms before auto-close
  --query <text>       Shortcut for vars.query
  --vars-file <path>   JSON object for runtime variables
  --vars-json <json>   Inline JSON object for runtime variables

Config file:
  amw.config.json in current working directory.
  Example:
    {
      "headed": true,
      "disable_replay": false,
      "hold_open_ms": 30000,
      "session": "amw",
      "profile": "main",
      "profile_dir": "./profiles",
      "binary": "agent-browser",
      "store_dir": "./data"
    }
`);
}

function parseOptions(args) {
  const opts = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      opts[key] = true;
      continue;
    }
    opts[key] = next;
    i += 1;
  }
  return opts;
}

function mustGet(opts, key) {
  if (opts[key] === undefined || opts[key] === null || opts[key] === "") {
    throw new Error(`Missing required option --${key}`);
  }
  return opts[key];
}

function parseJsonFile(filePath) {
  const absolute = path.resolve(String(filePath));
  const raw = fs.readFileSync(absolute, "utf-8");
  const hasBom = raw.charCodeAt(0) === 0xfeff;
  const clean = hasBom ? raw.slice(1) : raw;
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${absolute}: ${msg}`);
  }
  return { parsed, hasBom, absolute };
}

function loadSteps(filePath) {
  const { parsed } = parseJsonFile(filePath);
  const stepList = Array.isArray(parsed) ? parsed : parsed.steps;
  if (!Array.isArray(stepList)) {
    throw new Error("steps file must be a JSON array or object with 'steps'");
  }
  return stepList.map((step, i) => normalizeStep(step, i));
}

function parseRuntimeVars(opts) {
  let vars = {};
  if (opts["vars-file"]) {
    const fromFile = JSON.parse(fs.readFileSync(String(opts["vars-file"]), "utf-8"));
    if (!fromFile || typeof fromFile !== "object" || Array.isArray(fromFile)) {
      throw new Error("--vars-file must point to a JSON object");
    }
    vars = { ...vars, ...fromFile };
  }
  if (opts["vars-json"]) {
    const fromJson = JSON.parse(String(opts["vars-json"]));
    if (!fromJson || typeof fromJson !== "object" || Array.isArray(fromJson)) {
      throw new Error("--vars-json must be a JSON object");
    }
    vars = { ...vars, ...fromJson };
  }
  if (opts.query !== undefined) {
    vars.query = String(opts.query);
  }
  return vars;
}

function validateStepsPayload(payload) {
  const errors = [];
  const warnings = [];
  const stepList = Array.isArray(payload) ? payload : payload?.steps;

  if (!Array.isArray(stepList)) {
    errors.push("steps file must be a JSON array or object with 'steps'");
    return { errors, warnings, step_count: 0 };
  }

  if (!Array.isArray(payload) && payload && typeof payload === "object") {
    if (payload.amw_match_line === undefined) {
      warnings.push("missing amw_match_line (recommended for grep-first retrieval)");
    } else {
      const line = String(payload.amw_match_line);
      if (line.includes("\n") || line.includes("\r")) {
        errors.push("amw_match_line must be one physical line");
      }
      if (!line.includes("amw")) {
        warnings.push("amw_match_line should include anchor token 'amw'");
      }
    }
    if (payload.branches && typeof payload.branches === "object") {
      const branchCount = Object.keys(payload.branches).length;
      if (branchCount > 2) {
        errors.push(`branch count ${branchCount} exceeds max-2 policy`);
      }
    }
  }

  stepList.forEach((step, i) => {
    const at = `step[${i}]`;
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      errors.push(`${at} must be an object`);
      return;
    }
    const action = String(step.action ?? "").trim();
    if (!action) errors.push(`${at} missing action`);

    if (action === "eval_js") {
      const script = String(step.value ?? step.params?.script ?? "").trim();
      if (!script) errors.push(`${at} eval_js requires step.value or params.script`);
    }

    if (action === "copy_image_original") {
      const selector = String(step.target ?? step.params?.selector ?? "").trim();
      if (!selector) errors.push(`${at} copy_image_original requires selector (target or params.selector)`);
    }

    if (action === "assert_file") {
      const inPath = String(step.target ?? step.value ?? step.params?.path ?? "").trim();
      if (!inPath) errors.push(`${at} assert_file requires path in target/value/params.path`);
    }

    if (step.timeout_ms !== undefined) {
      const timeout = Number(step.timeout_ms);
      if (!Number.isFinite(timeout) || timeout < 0) {
        warnings.push(`${at} timeout_ms should be a non-negative number`);
      }
    }
  });

  return { errors, warnings, step_count: stepList.length };
}

async function cmdValidate(opts) {
  const stepsFile = String(opts["steps-file"] ?? opts["fallback-steps-file"] ?? "");
  if (!stepsFile) {
    throw new Error("validate requires --steps-file <path> (or --fallback-steps-file)");
  }
  const { parsed, hasBom, absolute } = parseJsonFile(stepsFile);
  const report = validateStepsPayload(parsed);
  if (hasBom) {
    report.warnings.push("UTF-8 BOM detected; consider saving as UTF-8 without BOM");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: report.errors.length === 0,
        file: absolute,
        step_count: report.step_count,
        errors: report.errors,
        warnings: report.warnings
      },
      null,
      2
    )}\n`
  );
  return report.errors.length === 0 ? 0 : 2;
}

async function cmdList(opts, config) {
  const storeDir = resolveStringOption(opts["store-dir"], config.store_dir, "./data");
  const store = new MemoryStore(path.join(storeDir, "memory.db"));
  try {
    const trajectories = store.listTrajectories({
      site: opts.site ?? null,
      taskType: opts["task-type"] ?? null,
      limit: Number(opts.limit ?? 50)
    });
    if (trajectories.length === 0) {
      process.stdout.write("No trajectories found.\n");
      return 0;
    }
    for (const traj of trajectories) {
      const stats = store.getStats(traj.trajectory_id);
      process.stdout.write(
        `${traj.trajectory_id} | site=${traj.site} task_type=${traj.task_type} ` +
          `steps=${traj.steps.length} success_rate=${stats.success_rate.toFixed(2)} usage=${stats.usage_count}\n`
      );
    }
    return 0;
  } finally {
    store.close();
  }
}

async function cmdSearch(opts, config) {
  const storeDir = resolveStringOption(opts["store-dir"], config.store_dir, "./data");
  const store = new MemoryStore(path.join(storeDir, "memory.db"));
  try {
    const retriever = new HybridRetriever(store);
    const hits = retriever.search({
      site: mustGet(opts, "site"),
      taskType: mustGet(opts, "task-type"),
      intent: mustGet(opts, "intent"),
      topK: Number(opts["top-k"] ?? 3)
    });
    if (hits.length === 0) {
      process.stdout.write("No retrieval hits.\n");
      return 0;
    }
    hits.forEach((hit, i) => {
      process.stdout.write(
        `${i + 1}. ${hit.trajectory.trajectory_id} score=${hit.score.toFixed(4)} detail=${JSON.stringify(hit.detail)}\n`
      );
    });
    return 0;
  } finally {
    store.close();
  }
}

async function cmdRecord(opts, config) {
  const storeDir = resolveStringOption(opts["store-dir"], config.store_dir, "./data");
  const holdOpenMs = resolveNumberOption(opts["hold-open-ms"], config.hold_open_ms, 0);
  const profile = resolveStringOption(opts.profile, config.profile, "main");
  const profileDir = resolveStringOption(opts["profile-dir"], config.profile_dir, "./profiles");
  const store = new MemoryStore(path.join(storeDir, "memory.db"));
  const logger = new RunLogger(storeDir);
  let adapter = null;
  try {
    const steps = loadSteps(mustGet(opts, "steps-file"));
    const site = domainFromSiteOrUrl(mustGet(opts, "site"));
    const taskType = mustGet(opts, "task-type");
    const intent = mustGet(opts, "intent");
    const trajectoryId = String(opts["trajectory-id"] ?? `${site}_${taskType}_${shortId()}`);
    const trajectory = buildTrajectory({
      trajectoryId,
      site,
      taskType,
      intent,
      steps,
      metadata: { source: "manual_record" }
    });
    const vars = parseRuntimeVars(opts);

    adapter = new AgentBrowserAdapter({
      binary: resolveStringOption(opts.binary, config.binary, "agent-browser"),
      session: resolveStringOption(opts.session, config.session, "amw"),
      headed: resolveBoolOption(opts.headed, config.headed),
      profile,
      profileDir
    });
    const executor = new TrajectoryExecutor({
      adapter,
      logger,
      initialVars: vars,
      context: { site, task_type: taskType, intent }
    });
    const result = await executor.replay(trajectory);
    if (result.success) {
      store.saveTrajectory(trajectory);
      store.recordResult(trajectory.trajectory_id, true, result.latency_ms);
      const summary = logger.summarize("success", {
        mode: "record",
        trajectory_id: trajectory.trajectory_id,
        executed_steps: result.executed_steps
      });
      process.stdout.write(`Recorded trajectory: ${trajectory.trajectory_id}\n`);
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      return 0;
    }
    store.recordResult(trajectory.trajectory_id, false, result.latency_ms);
    const summary = logger.summarize("failed", {
      mode: "record",
      reason: result.reason
    });
    process.stderr.write(`Record failed: ${result.reason}\n`);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 2;
  } finally {
    if (adapter) {
      if (holdOpenMs > 0) {
        process.stdout.write(`Holding browser open for ${holdOpenMs} ms...\n`);
        await sleep(holdOpenMs);
      }
      await adapter.close().catch(() => {});
    }
    store.close();
  }
}

async function cmdRun(opts, config) {
  const storeDir = resolveStringOption(opts["store-dir"], config.store_dir, "./data");
  const profile = resolveStringOption(opts.profile, config.profile, "main");
  const profileDir = resolveStringOption(opts["profile-dir"], config.profile_dir, "./profiles");
  const store = new MemoryStore(path.join(storeDir, "memory.db"));
  try {
    const orchestrator = new MemoryOrchestrator({
      store,
      dataDir: storeDir,
      binary: resolveStringOption(opts.binary, config.binary, "agent-browser")
    });
    const fallbackSteps = opts["fallback-steps-file"]
      ? loadSteps(opts["fallback-steps-file"])
      : null;
    const request = {
      site: mustGet(opts, "site"),
      task_type: mustGet(opts, "task-type"),
      intent: mustGet(opts, "intent"),
      session: resolveStringOption(opts.session, config.session, "amw"),
      profile,
      profile_dir: profileDir,
      headed: resolveBoolOption(opts.headed, config.headed),
      disable_replay: resolveBoolOption(opts["disable-replay"], config.disable_replay),
      hold_open_ms: resolveNumberOption(opts["hold-open-ms"], config.hold_open_ms, 0),
      vars: parseRuntimeVars(opts)
    };
    const outcome = await orchestrator.run({ request, fallbackSteps });
    process.stdout.write(
      `${JSON.stringify(
        {
          success: outcome.success,
          mode: outcome.mode,
          reason: outcome.result.reason,
          selected_trajectory_id: outcome.selected_trajectory_id,
          summary: outcome.summary
        },
        null,
        2
      )}\n`
    );
    return outcome.success ? 0 : 2;
  } finally {
    store.close();
  }
}

async function main() {
  const config = loadConfig(process.cwd());
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    printHelp();
    return;
  }
  const command = args[0];
  const opts = parseOptions(args.slice(1));
  if (command === "list") process.exitCode = await cmdList(opts, config);
  else if (command === "search") process.exitCode = await cmdSearch(opts, config);
  else if (command === "record") process.exitCode = await cmdRecord(opts, config);
  else if (command === "validate") process.exitCode = await cmdValidate(opts);
  else if (command === "run") process.exitCode = await cmdRun(opts, config);
  else {
    process.stderr.write(`Unknown command: ${command}\n`);
    printHelp();
    process.exitCode = 1;
  }
}

const entrypoint = fileURLToPath(import.meta.url);
if (process.argv[1] === entrypoint) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
