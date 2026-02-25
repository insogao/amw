import { tokenize, normalizeText } from "./utils.js";

export function normalizeGuard(raw) {
  return {
    kind: String(raw?.kind ?? "").trim(),
    value: String(raw?.value ?? "").trim(),
    negate: Boolean(raw?.negate ?? false)
  };
}

export function normalizeStep(raw, index) {
  return {
    id: String(raw?.id ?? `step_${index + 1}`),
    action: String(raw?.action ?? "").trim(),
    target: String(raw?.target ?? ""),
    value: String(raw?.value ?? ""),
    params: (raw?.params && typeof raw.params === "object" && !Array.isArray(raw.params))
      ? raw.params
      : {},
    timeout_ms: Number(raw?.timeout_ms ?? 30000),
    optional: Boolean(raw?.optional ?? false),
    guards: Array.isArray(raw?.guards) ? raw.guards.map(normalizeGuard) : [],
    notes: String(raw?.notes ?? "")
  };
}

export function buildTrajectory({
  trajectoryId,
  site,
  taskType,
  intent,
  steps,
  keywords = [],
  version = 1,
  metadata = {}
}) {
  const intentSignature = tokenize(intent).join(" ");
  const mergedKeywords = [
    ...new Set([...keywords, ...tokenize(intent), String(site), String(taskType)].map(normalizeText))
  ].filter(Boolean);
  const now = new Date().toISOString();

  return {
    trajectory_id: String(trajectoryId),
    site: String(site),
    task_type: String(taskType),
    intent: String(intent),
    intent_signature: intentSignature,
    keywords: mergedKeywords,
    version: Number(version),
    metadata,
    created_at: now,
    updated_at: now,
    steps: (steps ?? []).map((s, i) => normalizeStep(s, i))
  };
}
