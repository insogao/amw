import fs from "node:fs";
import path from "node:path";
import { utcNowIso, shortId } from "./utils.js";

export class RunLogger {
  constructor(baseDir, runId = null) {
    this.baseDir = baseDir;
    this.runId = runId || shortId("run");
    this.startedAt = Date.now();

    this.runDir = path.join(this.baseDir, "runs", this.runId);
    fs.mkdirSync(this.runDir, { recursive: true });
    this.eventsFile = path.join(this.runDir, "events.jsonl");
    this.summaryFile = path.join(this.runDir, "summary.json");
  }

  event(eventType, payload = {}) {
    const row = {
      ts: utcNowIso(),
      run_id: this.runId,
      event_type: eventType,
      payload
    };
    fs.appendFileSync(this.eventsFile, `${JSON.stringify(row)}\n`, "utf-8");
  }

  readEvents() {
    if (!fs.existsSync(this.eventsFile)) return [];
    const rows = [];
    const lines = fs.readFileSync(this.eventsFile, "utf-8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        rows.push(JSON.parse(line));
      } catch {
        continue;
      }
    }
    return rows;
  }

  summarize(status, extra = {}) {
    const events = this.readEvents();
    const errorEvents = events.filter((e) =>
      ["step_error", "guard_failed", "run_failed"].includes(e.event_type)
    );

    const summary = {
      run_id: this.runId,
      status,
      elapsed_ms: Date.now() - this.startedAt,
      events: events.length,
      errors: errorEvents.length,
      error_events: errorEvents.slice(-5),
      finished_at: utcNowIso(),
      ...extra
    };
    fs.writeFileSync(this.summaryFile, JSON.stringify(summary, null, 2), "utf-8");
    return summary;
  }
}

export class TraceLogger {
  constructor(traceFilePath, metadata = {}) {
    this.traceFile = path.resolve(String(traceFilePath));
    this.startedAt = Date.now();
    this.events = 0;
    fs.mkdirSync(path.dirname(this.traceFile), { recursive: true });
    this.event("trace_start", metadata);
  }

  event(eventType, payload = {}) {
    this.events += 1;
    const row = {
      ts: utcNowIso(),
      seq: this.events,
      event_type: String(eventType || "unknown"),
      payload
    };
    fs.appendFileSync(this.traceFile, `${JSON.stringify(row)}\n`, "utf-8");
  }

  summarize(status = "success", extra = {}) {
    const summary = {
      status,
      trace_file: this.traceFile,
      elapsed_ms: Date.now() - this.startedAt,
      events: this.events,
      finished_at: utcNowIso(),
      ...extra
    };
    this.event("trace_end", summary);
    return summary;
  }
}
