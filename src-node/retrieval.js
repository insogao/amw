import { domainFromSiteOrUrl, normalizeText, tokenize } from "./utils.js";

function lexicalOverlapScore(queryTokens, docTokens) {
  if (queryTokens.size === 0 || docTokens.size === 0) return 0;
  let overlap = 0;
  for (const t of queryTokens) {
    if (docTokens.has(t)) overlap += 1;
  }
  return overlap / queryTokens.size;
}

function trigrams(text) {
  const clean = ` ${normalizeText(text)} `;
  const set = new Set();
  for (let i = 0; i < clean.length - 2; i += 1) {
    set.add(clean.slice(i, i + 3));
  }
  return set;
}

function semanticLiteScore(a, b) {
  const as = trigrams(a);
  const bs = trigrams(b);
  if (as.size === 0 || bs.size === 0) return 0;
  let overlap = 0;
  for (const t of as) {
    if (bs.has(t)) overlap += 1;
  }
  return (2 * overlap) / (as.size + bs.size);
}

export class HybridRetriever {
  constructor(store) {
    this.store = store;
  }

  search({ site, taskType, intent, topK = 3 }) {
    const siteNorm = domainFromSiteOrUrl(site);
    const intentNorm = normalizeText(intent);
    const queryTokens = new Set(tokenize(`${siteNorm} ${taskType} ${intentNorm}`));

    let candidates = this.store.listTrajectories({ site: siteNorm, taskType, limit: 100 });
    if (candidates.length === 0) {
      candidates = this.store.listTrajectories({ site: siteNorm, limit: 200 });
    }
    if (candidates.length === 0) {
      candidates = this.store.listTrajectories({ taskType, limit: 200 });
    }

    const hits = [];
    for (const trajectory of candidates) {
      const { score, detail } = this.#scoreOne({
        trajectory,
        site: siteNorm,
        taskType,
        intent: intentNorm,
        queryTokens
      });
      if (score <= 0) continue;
      hits.push({ trajectory, score, detail });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK);
  }

  #scoreOne({ trajectory, site, taskType, intent, queryTokens }) {
    const docText = [
      trajectory.intent,
      trajectory.task_type,
      trajectory.site,
      ...(trajectory.keywords ?? [])
    ].join(" ");
    const docTokens = new Set(tokenize(docText));
    const lexical = lexicalOverlapScore(queryTokens, docTokens);
    const semantic = semanticLiteScore(intent, normalizeText(trajectory.intent));
    const stats = this.store.getStats(trajectory.trajectory_id);
    const reliability = (0.7 * stats.success_rate) + (0.3 * Math.min(stats.usage_count / 20, 1));
    const siteMatch = trajectory.site === site ? 1 : 0;
    const taskMatch = trajectory.task_type === taskType ? 1 : 0;

    const score =
      (0.2 * siteMatch) +
      (0.15 * taskMatch) +
      (0.3 * lexical) +
      (0.25 * semantic) +
      (0.1 * reliability);
    return {
      score,
      detail: {
        site_match: siteMatch,
        task_match: taskMatch,
        lexical,
        semantic_lite: semantic,
        reliability
      }
    };
  }
}

