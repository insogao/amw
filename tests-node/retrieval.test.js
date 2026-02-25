import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { MemoryStore } from "../src-node/memoryStore.js";
import { HybridRetriever } from "../src-node/retrieval.js";
import { buildTrajectory } from "../src-node/types.js";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "amw-"));
}

test("search prefers same site and task", () => {
  const dir = makeTempDir();
  const dbPath = path.join(dir, "memory.db");
  const store = new MemoryStore(dbPath);
  try {
    const t1 = buildTrajectory({
      trajectoryId: "google_search",
      site: "google.com",
      taskType: "web_search",
      intent: "search openai news",
      steps: [{ id: "s1", action: "open", target: "https://google.com" }]
    });
    const t2 = buildTrajectory({
      trajectoryId: "wiki_search",
      site: "wikipedia.org",
      taskType: "research",
      intent: "find openai history",
      steps: [{ id: "s1", action: "open", target: "https://wikipedia.org" }]
    });
    store.saveTrajectory(t1);
    store.saveTrajectory(t2);
    store.recordResult("google_search", true, 800);
    store.recordResult("google_search", true, 900);

    const retriever = new HybridRetriever(store);
    const hits = retriever.search({
      site: "google.com",
      taskType: "web_search",
      intent: "search openai latest news",
      topK: 2
    });
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].trajectory.trajectory_id, "google_search");
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

