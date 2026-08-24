import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEmail, summarizeClassifications } from './classifier.js';

function email(subject, snippet = '', labels = []) {
  return { subject, snippet, labels, from: { name: 'Example', email: 'hello@example.com' } };
}

test('detects a dating message and recommends virtual quarantine', () => {
  const result = classifyEmail(email('Easy hookups are waiting tonight'));
  assert.equal(result.id, 'rencontres');
  assert.equal(result.action, 'quarantine');
  assert.ok(result.confidence >= 0.7);
});

test('prioritizes invoices as messages to keep', () => {
  const result = classifyEmail(email('Votre facture est disponible', 'Paiement confirmé'));
  assert.equal(result.id, 'facture');
  assert.equal(result.action, 'keep');
});

test('keeps an explainable fallback for unmatched messages', () => {
  const result = classifyEmail(email('Bonjour', 'Comment allez-vous ?'));
  assert.equal(result.id, 'autre');
  assert.deepEqual(result.reasons, ['Aucune règle déterminante']);
});

test('summarizes category and action counts', () => {
  const messages = [email('Newsletter unsubscribe'), email('Meet singles nearby')]
    .map((message) => ({ ...message, classification: classifyEmail(message) }));
  const summary = summarizeClassifications(messages);
  assert.equal(summary.analyzed, 2);
  assert.equal(summary.quarantine, 1);
  assert.equal(summary.review, 1);
});
