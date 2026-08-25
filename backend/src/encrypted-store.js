import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function encryptionKey(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

export function createEncryptedStore({ filePath, secret } = {}) {
  const enabled = Boolean(filePath && typeof secret === 'string' && secret.length >= 32);

  return {
    enabled,
    load() {
      if (!enabled || !fs.existsSync(filePath)) return null;
      try {
        const envelope = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (envelope.version !== 1) throw new Error('version inconnue');
        const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(envelope.iv, 'base64'));
        decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
        const clear = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
        return JSON.parse(clear.toString('utf8'));
      } catch (error) {
        console.warn(`Stockage chiffré illisible (${path.basename(filePath)}) : ${error.message}`);
        return null;
      }
    },
    save(value) {
      if (!enabled) return false;
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      const envelope = JSON.stringify({
        version: 1,
        algorithm: 'aes-256-gcm',
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: encrypted.toString('base64'),
      });
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.${process.pid}.tmp`;
      fs.writeFileSync(temporaryPath, envelope, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temporaryPath, filePath);
      return true;
    },
    clear() {
      if (!enabled) return false;
      try { fs.unlinkSync(filePath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      return true;
    },
  };
}
