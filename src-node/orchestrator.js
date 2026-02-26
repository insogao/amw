import { AgentBrowserAdapter } from "./agentBrowserAdapter.js";
import { setTimeout as sleep } from "node:timers/promises";
import { RunLogger } from "./logger.js";
import { HybridRetriever } from "./retrieval.js";
import { TrajectoryExecutor } from "./trajectoryExecutor.js";
import { buildTrajectory } from "./types.js";
import { domainFromSiteOrUrl, shortId } from "./utils.js";

export class MemoryOrchestrator {
  constructor({ store, dataDir, binary = "agent-browser" }) {
    this.store = store;
    this.dataDir = dataDir;
    this.binary = binary;
    this.retriever = new HybridRetriever(store);
  }

  async run({ request, fallbackSteps = null }) {
    const logger = new RunLogger(this.dataDir);
    const adapter = new AgentBrowserAdapter({
      binary: this.binary,
      session: request.session || "amw",
      headed: Boolean(request.headed),
      profile: request.profile || "main",
      profileDir: request.profile_dir || "./profiles"
    });
    const executor = new TrajectoryExecutor({
      adapter,
      logger,
      initialVars: request.vars || {},
      context: {
        site: request.site,
        task_type: request.task_type,
        intent: request.intent
      }
    });
    try {
      logger.event("run_start", { request });
      const disableReplay = Boolean(request.disable_replay);
      if (!disableReplay) {
        const hits = this.retriever.search({
          site: request.site,
          taskType: request.task_type,
          intent: request.intent,
          topK: 3
        });
        logger.event("retrieval_result", {
          hits: hits.map((h) => ({
            trajectory_id: h.trajectory.trajectory_id,
            score: Number(h.score.toFixed(4)),
            detail: Object.fromEntries(
              Object.entries(h.detail).map(([k, v]) => [k, Number(v.toFixed(4))])
            )
          }))
        });

        if (hits.length > 0) {
          const hit = hits[0];
          const replayResult = await executor.replay(hit.trajectory);
          this.store.recordResult(hit.trajectory.trajectory_id, replayResult.success, replayResult.latency_ms);
          if (replayResult.success) {
            const summary = logger.summarize("success", {
              mode: "replay",
              trajectory_id: hit.trajectory.trajectory_id,
              executed_steps: replayResult.executed_steps
            });
            return {
              success: true,
              mode: "replay",
              result: replayResult,
              selected_trajectory_id: hit.trajectory.trajectory_id,
              summary
            };
          }
          logger.event("replay_failed", {
            trajectory_id: hit.trajectory.trajectory_id,
            reason: replayResult.reason
          });
        }
      } else {
        logger.event("retrieval_skipped", { reason: "disable_replay=true" });
      }

      if (!fallbackSteps || fallbackSteps.length === 0) {
        const result = {
          success: false,
          reason: "No successful replay and no fallback steps provided",
          executed_steps: 0,
          latency_ms: 0,
          failed_step_id: ""
        };
        const summary = logger.summarize("failed", {
          mode: "none",
          reason: result.reason
        });
        return {
          success: false,
          mode: "none",
          result,
          selected_trajectory_id: "",
          summary
        };
      }

      const fallbackTrajectory = this.#buildFallbackTrajectory(request, fallbackSteps);
      const fallbackResult = await executor.replay(fallbackTrajectory);
      if (fallbackResult.success) {
        this.store.saveTrajectory(fallbackTrajectory);
        this.store.recordResult(fallbackTrajectory.trajectory_id, true, fallbackResult.latency_ms);
        const summary = logger.summarize("success", {
          mode: "explore",
          trajectory_id: fallbackTrajectory.trajectory_id,
          executed_steps: fallbackResult.executed_steps
        });
        return {
          success: true,
          mode: "explore",
          result: fallbackResult,
          selected_trajectory_id: fallbackTrajectory.trajectory_id,
          summary
        };
      }

      const summary = logger.summarize("failed", {
        mode: "explore",
        trajectory_id: fallbackTrajectory.trajectory_id,
        reason: fallbackResult.reason
      });
      return {
        success: false,
        mode: "explore",
        result: fallbackResult,
        selected_trajectory_id: fallbackTrajectory.trajectory_id,
        summary
      };
    } finally {
      const holdOpenMs = Number(request.hold_open_ms ?? 0);
      if (holdOpenMs > 0) {
        logger.event("hold_open", { hold_open_ms: holdOpenMs });
        await sleep(holdOpenMs);
      }
      await adapter.close().catch(() => {});
    }
  }

  #buildFallbackTrajectory(request, steps) {
    const site = domainFromSiteOrUrl(request.site);
    return buildTrajectory({
      trajectoryId: `${site}_${request.task_type}_${shortId()}`,
      site,
      taskType: request.task_type,
      intent: request.intent,
      steps,
      metadata: { source: "fallback_steps" }
    });
  }
}
