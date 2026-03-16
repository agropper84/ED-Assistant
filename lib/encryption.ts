/**
 * AES-256-GCM Encryption for Google Sheets Patient Data
 *
 * Values are stored as: ENC:<base64(iv + ciphertext + authTag)>
 * Unencrypted values (no ENC: prefix) pass through unchanged,
 * allowing gradual migration from plaintext to encrypted.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const PREFIX = 'ENC:';

export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

export function encryptValue(plaintext: string, keyBase64: string): string {
  if (!plaintext || plaintext.trim() === '') return '';

  const key = Buffer.from(keyBase64, 'base64');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const packed = Buffer.concat([iv, encrypted, authTag]);
  return PREFIX + packed.toString('base64');
}

export function decryptValue(value: string, keyBase64: string): string {
  if (!value || value.trim() === '') return '';
  if (!value.startsWith(PREFIX)) return value;

  try {
    const key = Buffer.from(keyBase64, 'base64');
    const packed = Buffer.from(value.substring(PREFIX.length), 'base64');

    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(packed.length - TAG_LENGTH);
    const encrypted = packed.subarray(IV_LENGTH, packed.length - TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (e) {
    console.error('Decryption failed, returning raw value:', e);
    return value;
  }
}

export function encryptRow(row: string[], keyBase64: string): string[] {
  return row.map(val => encryptValue(val, keyBase64));
}

export function decryptRow(row: string[], keyBase64: string): string[] {
  return row.map(val => decryptValue(val, keyBase64));
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}
