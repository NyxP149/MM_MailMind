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

const LEARNING_STOP_WORDS = new Set([
  'avec', 'dans', 'pour', 'votre', 'vous', 'nous', 'cette', 'notre', 'from', 'your', 'with', 'this', 'that', 'have', 'will', 'pourrait',
  'della', 'delle', 'sono', 'come', 'from', 'message', 'email', 'mail', 'nouveau', 'nouvelle', 'hello', 'bonjour', 're', 'fwd',
]);

const SHARED_MAIL_DOMAINS = new Set(['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'live.com']);

function normalizeLearningText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function fingerprint(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `local-${(hash >>> 0).toString(16)}`;
}

export function extractLearningSignals(email) {
  const domain = (email?.from?.email || '').split('@')[1]?.toLowerCase() || '';
  const keywords = [...new Set(normalizeLearningText(email?.subject).match(/[a-z0-9]{4,}/g) || [])]
    .filter((word) => !LEARNING_STOP_WORDS.has(word) && !/^\d+$/.test(word))
    .slice(0, 8);
  return {
    domain: SHARED_MAIL_DOMAINS.has(domain) ? '' : domain,
    keywords,
  };
}

export function createLearningExample(email, categoryId, correctedAt = new Date().toISOString()) {
  if (!CATEGORY_OPTIONS.some((category) => category.id === categoryId)) return null;
  const signals = extractLearningSignals(email);
  if (!signals.domain && !signals.keywords.length) return null;
  return {
    id: fingerprint(email?.id || `${signals.domain}:${email?.subject || ''}`),
    categoryId,
    domain: signals.domain,
    keywords: signals.keywords,
    correctedAt,
  };
}

export function upsertLearningExample(examples = [], example) {
  if (!example) return examples;
  return [example, ...examples.filter((current) => current.id !== example.id)].slice(0, 500);
}

export function buildLearningModel(examples = []) {
  const observations = new Map();
  const add = (type, value, categoryId) => {
    if (!value || !CATEGORY_OPTIONS.some((category) => category.id === categoryId)) return;
    const key = `${type}:${value}`;
    const observation = observations.get(key) || { type, value, total: 0, categories: {} };
    observation.total += 1;
    observation.categories[categoryId] = (observation.categories[categoryId] || 0) + 1;
    observations.set(key, observation);
  };

  examples.forEach((example) => {
    add('domain', example.domain, example.categoryId);
    example.keywords?.forEach((keyword) => add('keyword', keyword, example.categoryId));
  });

  return [...observations.values()].map((observation) => {
    const [categoryId, count] = Object.entries(observation.categories).sort((a, b) => b[1] - a[1])[0] || ['autre', 0];
    const confidence = observation.total ? count / observation.total : 0;
    const minimum = observation.type === 'domain' ? 2 : 3;
    return {
      type: observation.type,
      value: observation.value,
      categoryId,
      count,
      total: observation.total,
      confidence,
      active: count >= minimum && confidence >= 0.75,
    };
  }).sort((a, b) => Number(b.active) - Number(a.active) || b.count - a.count || a.value.localeCompare(b.value));
}

export function applyLearnedPreferences(emails, examples = []) {
  const model = buildLearningModel(examples).filter((signal) => signal.active);
  const domains = new Map(model.filter((signal) => signal.type === 'domain').map((signal) => [signal.value, signal]));
  const keywords = new Map(model.filter((signal) => signal.type === 'keyword').map((signal) => [signal.value, signal]));

  return emails.map((email) => {
    if (email.classification?.customRule) return email;
    const extracted = extractLearningSignals(email);
    const signal = domains.get(extracted.domain) || extracted.keywords
      .map((keyword) => keywords.get(keyword))
      .filter(Boolean)
      .sort((a, b) => b.count * b.confidence - a.count * a.confidence)[0];
    if (!signal) return email;

    const category = CATEGORY_OPTIONS.find((option) => option.id === signal.categoryId);
    if (!category) return email;
    return {
      ...email,
      classification: {
        ...category,
        confidence: Math.min(0.96, 0.65 + signal.confidence * 0.3),
        reasons: [`Préférence apprise : ${signal.type === 'domain' ? 'domaine' : 'mot-clé'} « ${signal.value} » confirmé ${signal.count} fois`],
        learned: true,
        learningSignal: { type: signal.type, value: signal.value },
      },
    };
  });
}

export function computeLearningMetrics(examples = []) {
  const signals = buildLearningModel(examples);
  const categoryCounts = examples.reduce((counts, example) => {
    counts[example.categoryId] = (counts[example.categoryId] || 0) + 1;
    return counts;
  }, {});
  return {
    examples: examples.length,
    activeSignals: signals.filter((signal) => signal.active),
    pendingSignals: signals.filter((signal) => !signal.active),
    categoryCounts,
  };
}

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
