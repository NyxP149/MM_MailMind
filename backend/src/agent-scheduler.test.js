import assert from 'node:assert/strict';
import test from 'node:test';
import { buildScheduledReport, createAgentScheduler, normalizeSchedule } from './agent-scheduler.js';

test('normalizeSchedule borne la politique planifiée', () => {
  assert.deepEqual(normalizeSchedule({ enabled: true, time: '25:99', timeZone: 'Invalid/Zone', threshold: 0.2, categories: ['spam', 'facture'], maxMessages: 500 }), {
    enabled: true, time: '08:00', timeZone: 'UTC', threshold: 0.8, categories: ['spam'], maxMessages: 50,
  });
  assert.deepEqual(normalizeSchedule({ categories: [] }).categories, []);
});

test('le rapport planifié reste une simulation sans action', () => {
  const report = buildScheduledReport([
    { id: 'one', classification: { id: 'spam', label: 'Spam', action: 'quarantine', confidence: 0.98 } },
    { id: 'two', classification: { id: 'travail', label: 'Travail', action: 'keep', confidence: 0.98 } },
  ], normalizeSchedule({ threshold: 0.9, categories: ['spam'] }), { id: 'report', startedAt: 'a', completedAt: 'b' });
  assert.equal(report.metrics.eligible, 1);
  assert.equal(report.metrics.executed, 0);
  assert.doesNotMatch(JSON.stringify(report), /"one"|"two"/);
});

test('l’ordonnanceur n’exécute qu’une fois par date locale', async () => {
  const fixed = new Date('2026-08-24T06:00:00.000Z');
  let scans = 0;
  const scheduler = createAgentScheduler({ scan: async () => { scans += 1; return []; }, now: () => fixed, intervalMs: 3_600_000 });
  scheduler.configure({ enabled: true, time: '08:00', timeZone: 'Europe/Rome' });
  await scheduler.tick();
  await scheduler.tick();
  assert.equal(scans, 1);
  assert.equal(scheduler.reports().length, 1);
});

test('l’ordonnanceur rattrape l’horaire et efface sa mémoire à la déconnexion', async () => {
  const fixed = new Date('2026-08-24T06:30:00.000Z');
  let scans = 0;
  const scheduler = createAgentScheduler({ scan: async () => { scans += 1; return []; }, now: () => fixed, intervalMs: 3_600_000 });
  scheduler.configure({ enabled: true, time: '08:00', timeZone: 'Europe/Rome' });
  await scheduler.tick();
  assert.equal(scans, 1);
  assert.equal(scheduler.status().lastRunDate, '2026-08-24');
  scheduler.reset();
  assert.equal(scheduler.status().enabled, false);
  assert.equal(scheduler.reports().length, 0);
});

test('l’ordonnanceur restaure et persiste son état V8', () => {
  let persisted;
  const scheduler = createAgentScheduler({
    scan: async () => [],
    intervalMs: 3_600_000,
    initialState: { schedule: { enabled: true, time: '07:30', timeZone: 'Europe/Rome', categories: ['spam'] }, lastRunDate: '2026-08-24', reports: [] },
    onStateChange: (state) => { persisted = state; },
  });
  assert.equal(scheduler.status().enabled, true);
  assert.equal(scheduler.status().time, '07:30');
  scheduler.disable();
  assert.equal(persisted.schedule.enabled, false);
  assert.equal(persisted.lastRunDate, '2026-08-24');
});
