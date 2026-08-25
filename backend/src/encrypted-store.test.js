import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createEncryptedStore } from './encrypted-store.js';

test('le stockage persistant chiffre, relit et efface les données', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mailmind-store-'));
  const filePath = path.join(directory, 'oauth.enc');
  const store = createEncryptedStore({ filePath, secret: 'secret-de-test-suffisamment-long' });
  const credentials = { access_token: 'token-confidentiel', refresh_token: 'refresh-confidentiel' };

  try {
    assert.equal(store.save(credentials), true);
    assert.deepEqual(store.load(), credentials);
    assert.doesNotMatch(fs.readFileSync(filePath, 'utf8'), /token-confidentiel/);
    store.clear();
    assert.equal(store.load(), null);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('une clé différente ne peut pas déchiffrer le stockage', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mailmind-store-'));
  const filePath = path.join(directory, 'state.enc');
  try {
    createEncryptedStore({ filePath, secret: 'premiere-cle-de-test-avec-32-caracteres' }).save({ enabled: true });
    const originalWarning = console.warn;
    console.warn = () => {};
    try {
      assert.equal(createEncryptedStore({ filePath, secret: 'autre-cle-de-test-avec-au-moins-32-caracteres' }).load(), null);
    } finally {
      console.warn = originalWarning;
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('une clé trop courte désactive la persistance', () => {
  assert.equal(createEncryptedStore({ filePath: '/tmp/mailmind.enc', secret: 'courte' }).enabled, false);
});
