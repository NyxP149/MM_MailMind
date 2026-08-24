import { describe, expect, it } from 'vitest';
import { applyClassificationOverrides, applyCustomRules, applyLearnedPreferences, buildLearningModel, computeDashboardMetrics, computeLearningMetrics, computeQualityMetrics, createLearningExample, extractLearningSignals, mergeEmails, upsertLearningExample } from './classification.js';

describe('applyClassificationOverrides', () => {
  it('replaces an automatic category with an explainable manual correction', () => {
    const emails = [{ id: '1', classification: { id: 'spam', label: 'Spam' } }];
    const [result] = applyClassificationOverrides(emails, {
      1: { categoryId: 'facture' },
    });

    expect(result.classification.id).toBe('facture');
    expect(result.classification.corrected).toBe(true);
    expect(result.classification.confidence).toBe(1);
  });

  it('keeps the automatic category when no correction exists', () => {
    const email = { id: '1', classification: { id: 'spam' } };
    expect(applyClassificationOverrides([email], {})[0]).toBe(email);
  });
});

describe('applyCustomRules', () => {
  const source = [{
    id: '1',
    subject: 'Votre commande',
    from: { name: 'Shop', email: 'receipt@shop.example' },
    classification: { id: 'autre', label: 'Autre' },
  }];

  it('classifies a matching domain with the selected category', () => {
    const [result] = applyCustomRules(source, [{
      id: 'r1', field: 'domain', operator: 'equals', value: 'shop.example', categoryId: 'facture', enabled: true,
    }]);
    expect(result.classification.id).toBe('facture');
    expect(result.classification.customRule).toBe(true);
  });

  it('ignores disabled rules', () => {
    const [result] = applyCustomRules(source, [{
      id: 'r1', field: 'domain', operator: 'contains', value: 'shop', categoryId: 'spam', enabled: false,
    }]);
    expect(result).toBe(source[0]);
  });
});

describe('mergeEmails', () => {
  it('deduplicates paginated Gmail results by message id', () => {
    expect(mergeEmails([{ id: '1' }, { id: '2' }], [{ id: '2' }, { id: '3' }]))
      .toEqual([{ id: '1' }, { id: '2' }, { id: '3' }]);
  });
});

describe('computeQualityMetrics', () => {
  it('measures reviewed quarantine suggestions without counting message content', () => {
    const emails = [
      { id: '1', classification: { id: 'spam', label: 'Spam', action: 'quarantine' } },
      { id: '2', classification: { id: 'spam', label: 'Spam', action: 'quarantine' } },
      { id: '3', classification: { id: 'facture', label: 'Facture', action: 'keep' } },
    ];
    const result = computeQualityMetrics(emails, { 1: 'confirmed', 2: 'safe' }, { 3: { categoryId: 'facture' } });

    expect(result.reviewed).toBe(2);
    expect(result.precision).toBe(50);
    expect(result.coverage).toBe(100);
    expect(result.corrections).toBe(1);
  });
});

describe('computeDashboardMetrics', () => {
  it('aggregates activity without requiring message content', () => {
    const emails = [
      { id: '1', quarantined: true, classification: { id: 'spam', label: 'Spam' } },
      { id: '2', quarantined: false, classification: { id: 'facture', label: 'Facture' } },
    ];
    const result = computeDashboardMetrics(
      emails,
      { 1: 'confirmed', 2: 'safe' },
      [{ action: 'quarantine' }, { action: 'restore' }],
    );

    expect(result.analyzed).toBe(2);
    expect(result.reviewed).toBe(2);
    expect(result.quarantinedInGmail).toBe(1);
    expect(result.restored).toBe(1);
    expect(result.categories[0].count).toBe(1);
  });
});

describe('apprentissage local V6', () => {
  const email = (id, subject, address = `info@shop.example`) => ({
    id,
    subject,
    from: { name: 'Service', email: address },
    classification: { id: 'autre', label: 'Autre', action: 'keep' },
  });

  it('extrait des signaux minimisés sans conserver le sujet complet', () => {
    expect(extractLearningSignals(email('1', 'Votre facture mensuelle disponible'))).toEqual({
      domain: 'shop.example',
      keywords: ['facture', 'mensuelle', 'disponible'],
    });
    expect(extractLearningSignals(email('2', 'Message personnel', 'person@gmail.com')).domain).toBe('');
  });

  it('remplace la correction précédente du même message', () => {
    const first = createLearningExample(email('1', 'Facture disponible'), 'facture', '2026-01-01T00:00:00.000Z');
    const second = createLearningExample(email('1', 'Facture disponible'), 'travail', '2026-01-02T00:00:00.000Z');
    const examples = upsertLearningExample(upsertLearningExample([], first), second);
    expect(examples).toHaveLength(1);
    expect(examples[0].categoryId).toBe('travail');
    expect(examples[0]).not.toHaveProperty('subject');
  });

  it('active un domaine après deux corrections concordantes', () => {
    const examples = [
      createLearningExample(email('1', 'Facture janvier'), 'facture'),
      createLearningExample(email('2', 'Facture février'), 'facture'),
    ];
    const domain = buildLearningModel(examples).find((signal) => signal.type === 'domain');
    expect(domain.active).toBe(true);
    expect(domain.categoryId).toBe('facture');
    expect(computeLearningMetrics(examples).activeSignals).toHaveLength(1);
  });

  it('applique la préférence apprise sans écraser une règle explicite', () => {
    const examples = [
      createLearningExample(email('1', 'Facture janvier'), 'facture'),
      createLearningExample(email('2', 'Facture février'), 'facture'),
    ];
    const [learned] = applyLearnedPreferences([email('3', 'Votre reçu')], examples);
    expect(learned.classification.id).toBe('facture');
    expect(learned.classification.learned).toBe(true);

    const explicit = { ...email('4', 'Votre reçu'), classification: { id: 'travail', customRule: true } };
    expect(applyLearnedPreferences([explicit], examples)[0]).toBe(explicit);
  });
});
