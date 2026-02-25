import { createInterface } from "node:readline/promises";
import process from "node:process";
import { createDefaultActionRegistry } from "./actionRegistry.js";
import { TaskMemory } from "./pageMemory.js";
import { AgentBrowserError } from "./agentBrowserAdapter.js";
import { renderTemplateValue } from "./template.js";

async function defaultHandoff(message) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    await rl.question(`${message}\nPress Enter to continue...`);
  } finally {
    rl.close();
  }
}

export class TrajectoryExecutor {
  constructor({
    adapter,
    logger,
    humanHandoff = null,
    actionRegistry = null,
    initialVars = {},
    context = {}
  }) {
    this.adapter = adapter;
    this.logger = logger;
    this.humanHandoff = humanHandoff || defaultHandoff;
    this.actionRegistry = actionRegistry || createDefaultActionRegistry();
    this.taskMemory = new TaskMemory();
    this.runtime = {
      vars: { ...initialVars },
      context: { ...context },
      env: process.env,
      last_result: null,
      artifacts: {
        generated_files: []
      }
    };
  }

  async replay(trajectory) {
    const start = Date.now();
    let executedSteps = 0;
    this.logger.event("trajectory_start", {
      trajectory_id: trajectory.trajectory_id,
      site: trajectory.site,
      task_type: trajectory.task_type,
      version: trajectory.version
    });

    for (const step of trajectory.steps) {
      const effectiveStep = this.#resolveStep(step);
      this.logger.event("step_start", { step: effectiveStep });
      try {
        if (effectiveStep.action === "human_handoff") {
          await this.humanHandoff(
            effectiveStep.value || "Human handoff required. Complete action and press Enter."
          );
          this.logger.event("step_done", { step_id: effectiveStep.id, action: "human_handoff" });
          executedSteps += 1;
          continue;
        }

        const handler = this.actionRegistry.get(effectiveStep.action);
        if (!handler) {
          throw new Error(`Unsupported action '${effectiveStep.action}'. Register it in actionRegistry.`);
        }

        const result = await handler({
          adapter: this.adapter,
          logger: this.logger,
          step: effectiveStep,
          runtime: this.runtime
        });

        this.runtime.last_result = result;
        const saveAs = String(effectiveStep.params?.save_as ?? "").trim();
        if (saveAs) {
          this.runtime.vars[saveAs] = result;
        }

        executedSteps += 1;
        await this.#recordVisitIfPossible(effectiveStep);

        if (!(await this.#checkGuards(effectiveStep))) {
          const message = `Guard failed for step ${effectiveStep.id}`;
          this.logger.event("guard_failed", {
            step_id: effectiveStep.id,
            guards: effectiveStep.guards
          });
          if (effectiveStep.optional) {
            this.logger.event("step_skipped", { step_id: effectiveStep.id, reason: message });
            continue;
          }
          return {
            success: false,
            reason: message,
            executed_steps: executedSteps,
            latency_ms: Date.now() - start,
            failed_step_id: effectiveStep.id
          };
        }
        this.logger.event("step_done", { step_id: effectiveStep.id, result });
      } catch (error) {
        const message = String(error instanceof Error ? error.message : error);
        this.logger.event("step_error", {
          step_id: effectiveStep.id,
          action: effectiveStep.action,
          error: message
        });
        if (effectiveStep.optional) {
          this.logger.event("step_skipped", { step_id: effectiveStep.id, reason: message });
          continue;
        }
        return {
          success: false,
          reason: message,
          executed_steps: executedSteps,
          latency_ms: Date.now() - start,
          failed_step_id: effectiveStep.id
        };
      }
    }

    const latency = Date.now() - start;
    this.logger.event("trajectory_done", {
      trajectory_id: trajectory.trajectory_id,
      latency_ms: latency
    });
    this.logger.event("task_memory_summary", {
      summary: this.taskMemory.getMemorySummary()
    });
    this.logger.event("runtime_artifacts", {
      artifacts: this.runtime.artifacts
    });
    return {
      success: true,
      reason: "ok",
      executed_steps: executedSteps,
      latency_ms: latency,
      failed_step_id: ""
    };
  }

  #resolveStep(step) {
    return renderTemplateValue(step, this.runtime);
  }

  async #checkGuards(step) {
    for (const guard of step.guards || []) {
      let passed = true;
      if (guard.kind === "url_contains") {
        passed = (await this.adapter.getUrl()).includes(guard.value);
      } else if (guard.kind === "url_matches") {
        passed = new RegExp(guard.value).test(await this.adapter.getUrl());
      } else if (guard.kind === "snapshot_contains") {
        const snap = await this.adapter.snapshot(false);
        const snapText = String(snap.snapshot ?? "");
        passed = snapText.includes(guard.value);
      } else {
        passed = false;
      }
      if (guard.negate) passed = !passed;
      if (!passed) return false;
    }
    return true;
  }

  async #recordVisitIfPossible(step) {
    if (step.action === "open" && step.target) {
      this.taskMemory.recordVisit(step.target);
      return;
    }
    if (["click", "fill", "type", "press", "wait"].includes(step.action)) {
      try {
        const currentUrl = await this.adapter.getUrl();
        if (currentUrl) this.taskMemory.recordVisit(currentUrl);
      } catch (error) {
        if (!(error instanceof AgentBrowserError)) {
          throw error;
        }
      }
    }
  }
}
