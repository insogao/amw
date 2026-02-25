import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { domainFromSiteOrUrl, utcNowIso } from "./utils.js";

export class MemoryStore {
  constructor(dbPath) {
    this.dbPath = dbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.#initDb();
  }

  #initDb() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trajectories (
        trajectory_id TEXT PRIMARY KEY,
        site TEXT NOT NULL,
        task_type TEXT NOT NULL,
        intent TEXT NOT NULL,
        intent_signature TEXT NOT NULL,
        keywords TEXT NOT NULL,
        version INTEGER NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        avg_latency_ms REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        path_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_traj_site_task ON trajectories(site, task_type);
      CREATE INDEX IF NOT EXISTS idx_traj_signature ON trajectories(intent_signature);
    `);
  }

  close() {
    this.db.close();
  }

  saveTrajectory(trajectory) {
    const now = utcNowIso();
    const site = domainFromSiteOrUrl(trajectory.site);
    const normalized = {
      ...trajectory,
      site,
      updated_at: now
    };
    const payload = JSON.stringify(normalized);
    const keywords = [...new Set(normalized.keywords ?? [])].join(" ");

    const existing = this.db
      .prepare("SELECT trajectory_id, created_at FROM trajectories WHERE trajectory_id = ?")
      .get(normalized.trajectory_id);

    if (existing) {
      this.db
        .prepare(`
          UPDATE trajectories
          SET site = ?, task_type = ?, intent = ?, intent_signature = ?, keywords = ?,
              version = ?, updated_at = ?, path_json = ?
          WHERE trajectory_id = ?
        `)
        .run(
          site,
          normalized.task_type,
          normalized.intent,
          normalized.intent_signature,
          keywords,
          Number(normalized.version ?? 1),
          now,
          payload,
          normalized.trajectory_id
        );
      return;
    }

    this.db
      .prepare(`
        INSERT INTO trajectories (
          trajectory_id, site, task_type, intent, intent_signature, keywords,
          version, created_at, updated_at, path_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        normalized.trajectory_id,
        site,
        normalized.task_type,
        normalized.intent,
        normalized.intent_signature,
        keywords,
        Number(normalized.version ?? 1),
        normalized.created_at ?? now,
        now,
        payload
      );
  }

  getTrajectory(trajectoryId) {
    const row = this.db
      .prepare("SELECT path_json FROM trajectories WHERE trajectory_id = ?")
      .get(trajectoryId);
    if (!row) return null;
    return JSON.parse(row.path_json);
  }

  listTrajectories({ site = null, taskType = null, limit = 200 } = {}) {
    let sql = "SELECT path_json FROM trajectories WHERE 1 = 1";
    const args = [];
    if (site) {
      sql += " AND site = ?";
      args.push(domainFromSiteOrUrl(site));
    }
    if (taskType) {
      sql += " AND task_type = ?";
      args.push(taskType);
    }
    sql += " ORDER BY updated_at DESC LIMIT ?";
    args.push(Number(limit));

    const rows = this.db.prepare(sql).all(...args);
    return rows.map((row) => JSON.parse(row.path_json));
  }

  recordResult(trajectoryId, success, latencyMs) {
    const row = this.db
      .prepare(`
        SELECT usage_count, success_count, failure_count, avg_latency_ms
        FROM trajectories WHERE trajectory_id = ?
      `)
      .get(trajectoryId);
    if (!row) return;

    const usage = Number(row.usage_count) + 1;
    const successCount = Number(row.success_count) + (success ? 1 : 0);
    const failureCount = Number(row.failure_count) + (success ? 0 : 1);
    const prevAvg = Number(row.avg_latency_ms);
    const newAvg = ((prevAvg * (usage - 1)) + Number(latencyMs)) / Math.max(usage, 1);

    this.db
      .prepare(`
        UPDATE trajectories
        SET usage_count = ?, success_count = ?, failure_count = ?,
            avg_latency_ms = ?, updated_at = ?
        WHERE trajectory_id = ?
      `)
      .run(usage, successCount, failureCount, newAvg, utcNowIso(), trajectoryId);
  }

  getStats(trajectoryId) {
    const row = this.db
      .prepare(`
        SELECT usage_count, success_count, failure_count, avg_latency_ms
        FROM trajectories WHERE trajectory_id = ?
      `)
      .get(trajectoryId);

    if (!row) {
      return { usage_count: 0, success_rate: 0.0, avg_latency_ms: 0.0 };
    }
    const usage = Number(row.usage_count);
    const successCount = Number(row.success_count);
    return {
      usage_count: usage,
      success_rate: usage > 0 ? successCount / usage : 0,
      avg_latency_ms: Number(row.avg_latency_ms)
    };
  }
}

