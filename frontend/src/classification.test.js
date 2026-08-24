import { describe, expect, it } from 'vitest';
import { applyClassificationOverrides, applyCustomRules, computeDashboardMetrics, computeQualityMetrics, mergeEmails } from './classification.js';

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
