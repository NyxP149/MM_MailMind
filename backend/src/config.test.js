import assert from 'node:assert/strict';
import test from 'node:test';
import { getConfig } from './config.js';

test('getConfig active Ollama sans clé API', () => {
  const config = getConfig({ AI_PROVIDER: 'ollama' });

  assert.equal(config.aiReady, true);
  assert.equal(config.aiProvider, 'ollama');
  assert.equal(config.aiModel, 'qwen3:4b');
  assert.equal(config.ollamaBaseUrl, 'http://127.0.0.1:11434');
});

test('getConfig exige une clé pour OpenAI', () => {
  assert.equal(getConfig({ AI_PROVIDER: 'openai' }).aiReady, false);
  assert.equal(getConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'secret' }).aiReady, true);
});
