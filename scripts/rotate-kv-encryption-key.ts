#!/usr/bin/env npx tsx
/**
 * KV Encryption Key Rotation Script
 *
 * Decrypts all encrypted values in Redis with the OLD key,
 * re-encrypts them with the NEW key, and writes them back.
 *
 * Usage:
 *   OLD_KV_KEY="<old-base64-key>" NEW_KV_KEY="<new-base64-key>" npx tsx scripts/rotate-kv-encryption-key.ts
 *
 * Dry run (read-only, shows what would be migrated):
 *   OLD_KV_KEY="..." NEW_KV_KEY="..." DRY_RUN=1 npx tsx scripts/rotate-kv-encryption-key.ts
 */

import Redis from 'ioredis';
import { encryptValue, decryptValue } from '../lib/encryption';

const OLD_KEY = process.env.OLD_KV_KEY;
const NEW_KEY = process.env.NEW_KV_KEY;
const DRY_RUN = process.env.DRY_RUN === '1';
const REDIS_URL = process.env.REDIS_URL || process.env.edassistantkv_REDIS_URL;

if (!OLD_KEY || !NEW_KEY) {
  console.error('Usage: OLD_KV_KEY="..." NEW_KV_KEY="..." npx tsx scripts/rotate-kv-encryption-key.ts');
  process.exit(1);
}
if (!REDIS_URL) {
  console.error('REDIS_URL or edassistantkv_REDIS_URL must be set');
  process.exit(1);
}
if (OLD_KEY === NEW_KEY) {
  console.error('OLD_KV_KEY and NEW_KV_KEY must be different');
  process.exit(1);
}

// Validate key lengths
for (const [name, key] of [['OLD_KV_KEY', OLD_KEY], ['NEW_KV_KEY', NEW_KEY]]) {
  const buf = Buffer.from(key, 'base64');
  if (buf.length !== 32) {
    console.error(`${name} must be 32 bytes (got ${buf.length}). Generate with: openssl rand -base64 32`);
    process.exit(1);
  }
}

// Key patterns that store encrypted values (ENC: prefix)
const ENCRYPTED_KEY_PATTERNS = [
  'user:*:encryption-key',
  'user:*:refresh-token',
  'user:*:claude-api-key',
  'user:*:openai-api-key',
  'user:*:deepgram-api-key',
  'user:*:wispr-api-key',
  'user:*:pin-hash',
  'user:*:totp-secret',
  'user:*:settings',
  'submissions:*',
  'pending-audio:*',
];

const PREFIX = 'ENC:';

async function main() {
  const redis = new Redis(REDIS_URL!, { connectTimeout: 5000, commandTimeout: 5000 });

  console.log(DRY_RUN ? '\n=== DRY RUN (no writes) ===' : '\n=== ROTATING KV ENCRYPTION KEY ===');
  console.log(`Patterns to scan: ${ENCRYPTED_KEY_PATTERNS.length}`);

  let total = 0;
  let migrated = 0;
  let skippedPlaintext = 0;
  let skippedEmpty = 0;
  let errors = 0;

  for (const pattern of ENCRYPTED_KEY_PATTERNS) {
    const keys = await scanKeys(redis, pattern);
    if (keys.length === 0) continue;

    console.log(`\n[${pattern}] Found ${keys.length} keys`);

    for (const key of keys) {
      total++;
      try {
        const val = await redis.get(key);
        if (!val || val.trim() === '') {
          skippedEmpty++;
          continue;
        }

        // Only migrate values that are actually encrypted
        if (!val.startsWith(PREFIX)) {
          skippedPlaintext++;
          console.log(`  SKIP (plaintext): ${key}`);
          continue;
        }

        // Decrypt with old key
        const plaintext = decryptValue(val, OLD_KEY!);

        // Re-encrypt with new key
        const reencrypted = encryptValue(plaintext, NEW_KEY!);

        if (!DRY_RUN) {
          // Preserve TTL if set
          const ttl = await redis.ttl(key);
          if (ttl > 0) {
            await redis.set(key, reencrypted, 'EX', ttl);
          } else {
            await redis.set(key, reencrypted);
          }
        }

        migrated++;
        console.log(`  ${DRY_RUN ? 'WOULD MIGRATE' : 'MIGRATED'}: ${key}`);
      } catch (err: any) {
        errors++;
        console.error(`  ERROR: ${key} — ${err.message}`);
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total keys scanned: ${total}`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped (plaintext): ${skippedPlaintext}`);
  console.log(`Skipped (empty): ${skippedEmpty}`);
  console.log(`Errors: ${errors}`);

  if (DRY_RUN) {
    console.log('\nThis was a dry run. Remove DRY_RUN=1 to execute.');
  } else if (errors === 0) {
    console.log('\nKey rotation complete. Update KV_ENCRYPTION_KEY in Vercel to the new key.');
  } else {
    console.log('\nCompleted with errors. Review above and re-run if needed.');
  }

  await redis.quit();
}

async function scanKeys(redis: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
