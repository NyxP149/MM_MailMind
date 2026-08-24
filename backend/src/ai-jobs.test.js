import assert from 'node:assert/strict';
import test from 'node:test';
import { createAIJobManager } from './ai-jobs.js';

const waitForPromises = () => new Promise((resolve) => setImmediate(resolve));

test('une tâche IA continue et conserve son résultat', async () => {
  const manager = createAIJobManager({
    analyze: async () => ({ summary: 'Analyse terminée' }),
    createId: () => 'job-test',
    now: () => 1_000,
  });

  const started = manager.start({ aiProvider: 'ollama', aiModel: 'qwen3:4b' }, { subject: 'Sujet' });
  assert.equal(started.status, 'running');

  await waitForPromises();
  const completed = manager.get('job-test');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.result.analysis.summary, 'Analyse terminée');
  assert.equal(completed.result.provider, 'ollama');
});

test('une tâche IA conserve une erreur sérialisée', async () => {
  const manager = createAIJobManager({
    analyze: async () => { throw Object.assign(new Error('Ollama arrêté'), { code: 'OLLAMA_UNAVAILABLE' }); },
    createId: () => 'job-error',
    now: () => 2_000,
  });

  manager.start({ aiProvider: 'ollama', aiModel: 'qwen3:4b' }, { subject: 'Sujet' });
  await waitForPromises();

  assert.deepEqual(manager.get('job-error').error, {
    code: 'OLLAMA_UNAVAILABLE',
    message: 'Ollama arrêté',
  });
});
