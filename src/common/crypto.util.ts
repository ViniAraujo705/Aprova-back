import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function loadKey(): Buffer {
  const raw = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY nao configurada');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY deve ter 32 bytes (base64)',
    );
  }
  return key;
}

/**
 * Criptografa um segredo (ex.: refresh token) com AES-256-GCM. Formato do
 * retorno: base64(iv[12] + authTag[16] + ciphertext) - tudo num campo so,
 * pra caber numa unica coluna de texto.
 */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptSecret(encoded: string): string {
  const key = loadKey();
  const buffer = Buffer.from(encoded, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
