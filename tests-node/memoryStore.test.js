import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { MemoryStore } from "../src-node/memoryStore.js";
import { buildTrajectory } from "../src-node/types.js";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "amw-"));
}

test("save and get trajectory", () => {
  const dir = makeTempDir();
  const dbPath = path.join(dir, "memory.db");
  const store = new MemoryStore(dbPath);
  try {
    const trajectory = buildTrajectory({
      trajectoryId: "t1",
      site: "google.com",
      taskType: "search",
      intent: "search openai",
      steps: [{ id: "s1", action: "open", target: "https://google.com" }]
    });
    store.saveTrajectory(trajectory);
    const loaded = store.getTrajectory("t1");
    assert.ok(loaded);
    assert.equal(loaded.intent, "search openai");
    assert.equal(loaded.steps.length, 1);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("record result stats", () => {
  const dir = makeTempDir();
  const dbPath = path.join(dir, "memory.db");
  const store = new MemoryStore(dbPath);
  try {
    const trajectory = buildTrajectory({
      trajectoryId: "t2",
      site: "example.com",
      taskType: "login",
      intent: "login portal",
      steps: [{ id: "s1", action: "open", target: "https://example.com" }]
    });
    store.saveTrajectory(trajectory);
    store.recordResult("t2", true, 1000);
    store.recordResult("t2", false, 2000);
    const stats = store.getStats("t2");
    assert.equal(stats.usage_count, 2);
    assert.equal(stats.success_rate, 0.5);
    assert.equal(Math.round(stats.avg_latency_ms), 1500);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

