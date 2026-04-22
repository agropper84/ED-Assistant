import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';
import { encryptValue, decryptValue } from '@/lib/encryption';
import { getSessionFromCookies } from '@/lib/session';

export const maxDuration = 120;

const PREFIX = 'ENC:';

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

/**
 * POST /api/admin/rotate-kv-key
 * Body: { oldKey: string, newKey: string, dryRun?: boolean }
 *
 * Admin-only. Decrypts all encrypted Redis values with oldKey,
 * re-encrypts with newKey. After running, update KV_ENCRYPTION_KEY
 * in Vercel to the new key and redeploy.
 */
export async function POST(request: NextRequest) {
  // Admin auth check
  const session = await getSessionFromCookies();
  if (!session.email || session.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { oldKey, newKey, dryRun = false } = await request.json();

  if (!oldKey || !newKey) {
    return NextResponse.json({ error: 'oldKey and newKey are required' }, { status: 400 });
  }
  if (oldKey === newKey) {
    return NextResponse.json({ error: 'Keys must be different' }, { status: 400 });
  }

  // Validate key lengths
  for (const [name, key] of [['oldKey', oldKey], ['newKey', newKey]]) {
    const buf = Buffer.from(key as string, 'base64');
    if (buf.length !== 32) {
      return NextResponse.json({ error: `${name} must be 32 bytes base64 (got ${buf.length})` }, { status: 400 });
    }
  }

  const url = process.env.REDIS_URL || process.env.edassistantkv_REDIS_URL;
  if (!url) {
    return NextResponse.json({ error: 'REDIS_URL not configured' }, { status: 500 });
  }

  const redis = new Redis(url, { connectTimeout: 5000, commandTimeout: 5000 });
  redis.on('error', () => {});

  const log: string[] = [];
  let migrated = 0;
  let skippedPlaintext = 0;
  let skippedEmpty = 0;
  let errors = 0;

  try {
    for (const pattern of ENCRYPTED_KEY_PATTERNS) {
      const keys = await scanKeys(redis, pattern);
      if (keys.length === 0) continue;

      log.push(`[${pattern}] ${keys.length} keys`);

      for (const key of keys) {
        try {
          const val = await redis.get(key);
          if (!val || val.trim() === '') { skippedEmpty++; continue; }
          if (!val.startsWith(PREFIX)) {
            skippedPlaintext++;
            log.push(`  SKIP (plaintext): ${key}`);
            continue;
          }

          const plaintext = decryptValue(val, oldKey);
          const reencrypted = encryptValue(plaintext, newKey);

          if (!dryRun) {
            const ttl = await redis.ttl(key);
            if (ttl > 0) {
              await redis.set(key, reencrypted, 'EX', ttl);
            } else {
              await redis.set(key, reencrypted);
            }
          }

          migrated++;
          log.push(`  ${dryRun ? 'WOULD MIGRATE' : 'MIGRATED'}: ${key}`);
        } catch (err: any) {
          errors++;
          log.push(`  ERROR: ${key} — ${err.message}`);
        }
      }
    }
  } finally {
    await redis.quit();
  }

  return NextResponse.json({
    dryRun,
    migrated,
    skippedPlaintext,
    skippedEmpty,
    errors,
    log,
    nextStep: dryRun
      ? 'Review log, then re-run with dryRun: false'
      : errors === 0
        ? 'Update KV_ENCRYPTION_KEY in Vercel dashboard to the new key, then redeploy'
        : 'Completed with errors — review log',
  });
}
