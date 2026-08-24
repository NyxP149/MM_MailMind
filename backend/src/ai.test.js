import assert from 'node:assert/strict';
import test from 'node:test';
import { AIServiceError, analyzeEmailWithAI, extractAnalysis, sanitizeEmailForAI } from './ai.js';

test('sanitizeEmailForAI limite et minimise les données', () => {
  const result = sanitizeEmailForAI({
    subject: `  Facture\n${'x'.repeat(400)}`,
    senderDomain: 'EXAMPLE.COM',
    snippet: ' Montant dû demain. ',
    ruleSuggestion: 'Facture',
    senderEmail: 'personne@example.com',
  });

  assert.equal(result.subject.length, 300);
  assert.equal(result.senderDomain, 'example.com');
  assert.equal(result.snippet, 'Montant dû demain.');
  assert.equal('senderEmail' in result, false);
});

test('sanitizeEmailForAI refuse un message vide', () => {
  assert.throws(() => sanitizeEmailForAI({}), (error) => error instanceof AIServiceError && error.code === 'INVALID_AI_INPUT');
});

test('extractAnalysis lit la sortie structurée', () => {
  const expected = { summary: 'Une facture.' };
  const result = extractAnalysis({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(expected) }] }] });
  assert.deepEqual(result, expected);
});

test('extractAnalysis lit la réponse native Ollama', () => {
  const expected = { summary: 'Une facture locale.' };
  assert.deepEqual(extractAnalysis({ message: { content: JSON.stringify(expected) } }), expected);
});

test('analyzeEmailWithAI désactive le stockage et utilise un schéma strict', async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"summary":"Résumé"}' }] }] }),
    };
  };

  await analyzeEmailWithAI(
    { aiProvider: 'openai', openaiApiKey: 'test-key', openaiModel: 'test-model' },
    { subject: 'Sujet', senderDomain: 'example.com' },
    fakeFetch,
  );

  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.body.store, false);
  assert.equal(request.body.text.format.type, 'json_schema');
  assert.equal(request.body.text.format.strict, true);
  assert.match(request.options.headers.Authorization, /^Bearer /);
  assert.doesNotMatch(request.options.body, /test-key/);
});

test('analyzeEmailWithAI utilise Ollama local avec un schéma JSON', async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({ message: { content: '{"summary":"Résumé local"}' } }),
    };
  };

  const result = await analyzeEmailWithAI(
    {
      aiProvider: 'ollama',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'qwen3:4b',
    },
    { subject: 'Sujet', senderDomain: 'example.com' },
    fakeFetch,
  );

  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(request.body.model, 'qwen3:4b');
  assert.equal(request.body.stream, false);
  assert.equal(request.body.think, false);
  assert.equal(request.body.format.type, 'object');
  assert.equal(request.body.options.temperature, 0);
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(result.summary, 'Résumé local');
});

test('analyzeEmailWithAI explique quand Ollama est arrêté', async () => {
  await assert.rejects(
    analyzeEmailWithAI(
      {
        aiProvider: 'ollama',
        ollamaBaseUrl: 'http://127.0.0.1:11434',
        ollamaModel: 'qwen3:4b',
      },
      { subject: 'Sujet' },
      async () => { throw new TypeError('fetch failed'); },
    ),
    (error) => error instanceof AIServiceError && error.code === 'OLLAMA_UNAVAILABLE',
  );
});
