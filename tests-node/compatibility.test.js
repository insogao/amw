import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultActionRegistry } from "../src-node/actionRegistry.js";
import { TrajectoryExecutor } from "../src-node/trajectoryExecutor.js";
import { normalizeStep } from "../src-node/types.js";

test("open action accepts step.value fallback", async () => {
  const registry = createDefaultActionRegistry();
  const open = registry.get("open");
  const calls = [];
  const adapter = {
    async open(url) {
      calls.push(url);
      return { url };
    }
  };
  await open({
    adapter,
    step: {
      id: "open_1",
      action: "open",
      target: "",
      value: "https://example.com",
      params: {},
      timeout_ms: 30000
    }
  });
  assert.equal(calls[0], "https://example.com");
});

test("normalizeStep mirrors top-level save_as into params.save_as", () => {
  const step = normalizeStep(
    {
      id: "s1",
      action: "eval_js",
      value: "return 1;",
      save_as: "probe_result"
    },
    0
  );
  assert.equal(step.save_as, "probe_result");
  assert.equal(step.params.save_as, "probe_result");
});

test("executor can reference vars saved from previous step", async () => {
  const actionRegistry = new Map([
    ["produce", async () => "done"],
    ["consume", async ({ step }) => step.value]
  ]);
  const logger = { event() {} };
  const executor = new TrajectoryExecutor({
    adapter: {},
    logger,
    actionRegistry
  });
  const trajectory = {
    trajectory_id: "t_comp",
    site: "example.com",
    task_type: "compat",
    version: 1,
    steps: [
      normalizeStep({ id: "s1", action: "produce", save_as: "answer" }, 0),
      normalizeStep({ id: "s2", action: "consume", value: "{{vars.answer}}" }, 1)
    ]
  };

  const result = await executor.replay(trajectory);
  assert.equal(result.success, true);
  assert.equal(executor.runtime.vars.answer, "done");
});
