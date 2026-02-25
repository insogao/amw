/*
Adapted from Clawome backend task memory model:
Clawome/backend/task_agent/models/memory.py
*/

export class TaskMemory {
  constructor() {
    this.pages = new Map();
    this.findings = [];
  }

  recordVisit(url, title = "") {
    const key = String(url).replace(/\/+$/, "");
    const now = new Date().toTimeString().slice(0, 8);
    const existing = this.pages.get(key);
    if (existing) {
      existing.visited_count += 1;
      existing.last_visited = now;
      if (title && !existing.title) existing.title = title;
      return existing;
    }
    const page = {
      url: String(url),
      title: String(title),
      summary: "",
      visited_count: 1,
      last_visited: now,
      key_info: []
    };
    this.pages.set(key, page);
    return page;
  }

  addFinding(finding) {
    const text = String(finding ?? "").trim();
    if (text && !this.findings.includes(text)) {
      this.findings.push(text);
    }
  }

  getMemorySummary() {
    const parts = [];
    if (this.pages.size > 0) {
      const lines = [];
      for (const page of this.pages.values()) {
        let line = `- ${page.title || page.url} (${page.url})`;
        if (page.summary) line += `: ${page.summary}`;
        lines.push(line);
      }
      parts.push(`Visited pages:\n${lines.join("\n")}`);
    }
    if (this.findings.length > 0) {
      parts.push(`Findings:\n${this.findings.map((f) => `- ${f}`).join("\n")}`);
    }
    return parts.join("\n\n");
  }
}

