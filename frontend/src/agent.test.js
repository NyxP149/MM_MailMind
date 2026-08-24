import { describe, expect, it } from 'vitest';
import { buildAgentActivity, buildAgentPlan, createAgentReport } from './agent.js';

const email = (id, category, confidence, extra = {}) => ({
  id,
  classification: { id: category, label: category, action: ['spam', 'arnaque', 'adultes', 'rencontres'].includes(category) ? 'quarantine' : 'keep', confidence },
  ...extra,
});

describe('agent V7', () => {
  it('autorise uniquement les catégories et seuils explicitement configurés', () => {
    const plan = buildAgentPlan([
      email('one', 'spam', 0.97),
      email('two', 'spam', 0.7),
      email('three', 'arnaque', 0.99),
      email('four', 'travail', 1),
    ], { threshold: 0.9, categories: ['spam'] });

    expect(plan.eligible.map((item) => item.messageId)).toEqual(['one']);
    expect(plan.metrics).toEqual({ analyzed: 4, eligible: 1, ambiguous: 2, skipped: 0, protected: 1 });
  });

  it('ignore une action déjà appliquée pour garantir l’idempotence', () => {
    const plan = buildAgentPlan([email('done', 'spam', 0.99, { quarantined: true })], { threshold: 0.9, categories: ['spam'] });
    expect(plan.metrics.skipped).toBe(1);
    expect(plan.eligible).toHaveLength(0);
  });

  it('donne toujours priorité à une décision humaine sûre', () => {
    const plan = buildAgentPlan([email('human-safe', 'spam', 0.99)], { threshold: 0.9, categories: ['spam'] }, { 'human-safe': 'safe' });
    expect(plan.eligible).toHaveLength(0);
    expect(plan.metrics.protected).toBe(1);
  });

  it('produit un rapport sans identifiant Gmail ni contenu de message', () => {
    const plan = buildAgentPlan([email('sensitive-gmail-id', 'spam', 0.99)], { threshold: 0.9, categories: ['spam'] });
    const report = createAgentReport(plan, {
      id: 'run-1',
      events: [{ ...plan.eligible[0], outcome: 'success' }],
      completedAt: '2026-08-24T00:00:00.000Z',
    });

    expect(report.metrics.executed).toBe(1);
    expect(JSON.stringify(report)).not.toContain('sensitive-gmail-id');
    expect(report.events[0].messageFingerprint).toMatch(/^agent-/);
  });

  it('agrège et trie l’activité sans dupliquer les rapports', () => {
    const metrics = { analyzed: 10, executed: 0, failed: 0 };
    const activity = buildAgentActivity([
      { id: 'manual', mode: 'controlled', completedAt: '2026-08-24T09:00:00.000Z', metrics: { ...metrics, executed: 2 } },
    ], [
      { id: 'scheduled', mode: 'scheduled-simulation', completedAt: '2026-08-24T10:00:00.000Z', metrics },
      { id: 'manual', mode: 'controlled', completedAt: '2026-08-24T09:00:00.000Z', metrics },
    ]);

    expect(activity.reports.map((report) => report.id)).toEqual(['scheduled', 'manual']);
    expect(activity.metrics).toEqual({ runs: 2, analyzed: 20, executed: 2, failed: 0, simulations: 1, controlled: 1 });
  });
});
