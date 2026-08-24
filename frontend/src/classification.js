export const CATEGORY_OPTIONS = [
  { id: 'adultes', label: 'Adultes', action: 'quarantine' },
  { id: 'rencontres', label: 'Rencontres', action: 'quarantine' },
  { id: 'spam', label: 'Spam', action: 'quarantine' },
  { id: 'arnaque', label: 'Arnaque', action: 'quarantine' },
  { id: 'newsletter', label: 'Newsletter', action: 'review' },
  { id: 'publicite', label: 'Publicité', action: 'review' },
  { id: 'facture', label: 'Facture', action: 'keep' },
  { id: 'travail', label: 'Travail', action: 'keep' },
  { id: 'important', label: 'Important', action: 'keep' },
  { id: 'autre', label: 'Autre', action: 'keep' },
];

export function applyClassificationOverrides(emails, overrides = {}) {
  return emails.map((email) => {
    const override = overrides[email.id];
    if (!override) return email;
    const category = CATEGORY_OPTIONS.find((option) => option.id === override.categoryId);
    if (!category) return email;

    return {
      ...email,
      classification: {
        ...category,
        confidence: 1,
        reasons: ['Catégorie corrigée manuellement'],
        corrected: true,
      },
    };
  });
}

const RULE_FIELDS = {
  sender: (email) => email.from?.email || '',
  domain: (email) => (email.from?.email || '').split('@')[1] || '',
  subject: (email) => email.subject || '',
  senderName: (email) => email.from?.name || '',
};

export function applyCustomRules(emails, rules = []) {
  const enabledRules = rules.filter((rule) => rule.enabled !== false && rule.value?.trim());
  return emails.map((email) => {
    const rule = enabledRules.find((candidate) => {
      const source = (RULE_FIELDS[candidate.field]?.(email) || '').toLowerCase();
      const expected = candidate.value.trim().toLowerCase();
      return candidate.operator === 'equals' ? source === expected : source.includes(expected);
    });
    if (!rule) return email;

    const category = CATEGORY_OPTIONS.find((option) => option.id === rule.categoryId);
    if (!category) return email;
    return {
      ...email,
      classification: {
        ...category,
        confidence: 1,
        reasons: [`Règle personnalisée : ${rule.field} ${rule.operator === 'equals' ? 'égal à' : 'contient'} ${rule.value}`],
        customRule: true,
        ruleId: rule.id,
      },
    };
  });
}

export function readLocalMap(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

export function mergeEmails(current, incoming) {
  const unique = new Map(current.map((email) => [email.id, email]));
  incoming.forEach((email) => unique.set(email.id, email));
  return [...unique.values()];
}

export function computeQualityMetrics(emails, decisions = {}, overrides = {}) {
  const candidates = emails.filter((email) => email.classification?.action === 'quarantine');
  const reviewed = candidates.filter((email) => ['confirmed', 'safe'].includes(decisions[email.id]));
  const confirmed = reviewed.filter((email) => decisions[email.id] === 'confirmed').length;
  const falsePositives = reviewed.filter((email) => decisions[email.id] === 'safe').length;
  const loadedIds = new Set(emails.map((email) => email.id));
  const corrections = Object.keys(overrides).filter((id) => loadedIds.has(id)).length;
  const byCategory = {};

  for (const email of candidates) {
    const category = email.classification.id;
    byCategory[category] ||= { label: email.classification.label, total: 0, confirmed: 0, falsePositives: 0 };
    byCategory[category].total += 1;
    if (decisions[email.id] === 'confirmed') byCategory[category].confirmed += 1;
    if (decisions[email.id] === 'safe') byCategory[category].falsePositives += 1;
  }

  return {
    candidates: candidates.length,
    reviewed: reviewed.length,
    pending: candidates.length - reviewed.length,
    confirmed,
    falsePositives,
    corrections,
    precision: reviewed.length ? Math.round((confirmed / reviewed.length) * 100) : null,
    coverage: candidates.length ? Math.round((reviewed.length / candidates.length) * 100) : 0,
    byCategory,
  };
}

export function computeDashboardMetrics(emails, decisions = {}, history = []) {
  const decisionValues = Object.values(decisions);
  const reviewed = decisionValues.filter((decision) => ['confirmed', 'safe'].includes(decision)).length;
  const categories = emails.reduce((result, email) => {
    const id = email.classification?.id || 'autre';
    const label = email.classification?.label || 'Autre';
    result[id] ||= { id, label, count: 0 };
    result[id].count += 1;
    return result;
  }, {});

  return {
    analyzed: emails.length,
    reviewed,
    confirmed: decisionValues.filter((decision) => decision === 'confirmed').length,
    falsePositives: decisionValues.filter((decision) => decision === 'safe').length,
    quarantinedInGmail: emails.filter((email) => email.quarantined).length,
    restored: history.filter((event) => event.action === 'restore').length,
    actions: history.length,
    estimatedMinutesSaved: Math.round((reviewed * 12 + history.length * 8) / 60),
    categories: Object.values(categories).sort((a, b) => b.count - a.count),
  };
}
