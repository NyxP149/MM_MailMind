export const AGENT_CATEGORY_OPTIONS = [
  { id: 'adultes', label: 'Adultes' },
  { id: 'rencontres', label: 'Rencontres' },
  { id: 'spam', label: 'Spam' },
  { id: 'arnaque', label: 'Arnaque' },
];

export const DEFAULT_AGENT_POLICY = {
  threshold: 0.9,
  categories: AGENT_CATEGORY_OPTIONS.map((category) => category.id),
};

function fingerprint(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `agent-${(hash >>> 0).toString(16)}`;
}

export function buildAgentPlan(emails = [], policy = DEFAULT_AGENT_POLICY, decisions = {}) {
  const allowed = new Set(policy.categories || []);
  const threshold = Math.min(1, Math.max(0, Number(policy.threshold) || DEFAULT_AGENT_POLICY.threshold));
  const items = emails.map((email) => {
    const classification = email.classification || {};
    const base = {
      messageId: email.id,
      fingerprint: fingerprint(email.id),
      categoryId: classification.id || 'autre',
      categoryLabel: classification.label || 'Autre',
      confidence: Number(classification.confidence) || 0,
    };

    if (decisions[email.id] === 'safe') return { ...base, decision: 'protected', reason: 'Protégé par une décision humaine : faux positif.' };
    if (classification.action !== 'quarantine') return { ...base, decision: 'protected', reason: 'Aucune action Gmail autorisée pour cette catégorie.' };
    if (email.quarantined) return { ...base, decision: 'skipped', reason: 'Label déjà présent : action idempotente ignorée.' };
    if (!allowed.has(base.categoryId)) return { ...base, decision: 'ambiguous', reason: 'Catégorie non autorisée par la politique.' };
    if (base.confidence < threshold) return { ...base, decision: 'ambiguous', reason: `Confiance inférieure au seuil de ${Math.round(threshold * 100)} %.` };
    return { ...base, decision: 'eligible', reason: 'Catégorie et seuil autorisés.' };
  });

  const count = (decision) => items.filter((item) => item.decision === decision).length;
  const categories = items.reduce((summary, item) => {
    summary[item.categoryId] ||= { id: item.categoryId, label: item.categoryLabel, analyzed: 0, eligible: 0, ambiguous: 0 };
    summary[item.categoryId].analyzed += 1;
    if (item.decision === 'eligible') summary[item.categoryId].eligible += 1;
    if (item.decision === 'ambiguous') summary[item.categoryId].ambiguous += 1;
    return summary;
  }, {});

  return {
    policy: { threshold, categories: [...allowed] },
    items,
    eligible: items.filter((item) => item.decision === 'eligible'),
    ambiguous: items.filter((item) => item.decision === 'ambiguous'),
    metrics: {
      analyzed: items.length,
      eligible: count('eligible'),
      ambiguous: count('ambiguous'),
      skipped: count('skipped'),
      protected: count('protected'),
    },
    categories: Object.values(categories).sort((a, b) => b.analyzed - a.analyzed),
  };
}

export function createAgentReport(plan, {
  id,
  mode = 'simulation',
  status = 'completed',
  events = [],
  startedAt,
  completedAt = new Date().toISOString(),
} = {}) {
  const succeeded = events.filter((event) => event.outcome === 'success').length;
  const failed = events.filter((event) => event.outcome === 'failed').length;
  return {
    id: id || globalThis.crypto?.randomUUID?.() || `agent-${Date.now()}`,
    version: 1,
    mode,
    status,
    startedAt: startedAt || completedAt,
    completedAt,
    policy: plan.policy,
    metrics: {
      ...plan.metrics,
      executed: succeeded,
      failed,
    },
    categories: plan.categories,
    events: events.map(({ fingerprint: messageFingerprint, categoryId, categoryLabel, outcome, error }) => ({
      messageFingerprint,
      categoryId,
      categoryLabel,
      action: 'quarantine',
      outcome,
      ...(error ? { error } : {}),
    })),
  };
}
