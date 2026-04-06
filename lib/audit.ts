/**
 * Audit logging for patient data access.
 * Writes to Redis sorted sets keyed by timestamp.
 * Fire-and-forget — never blocks or throws.
 */

import Redis from 'ioredis';
import { getSessionFromCookies } from './session';

let redis: Redis | null = null;

function getAuditRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL || process.env.edassistantkv_REDIS_URL;
    if (!url) throw new Error('REDIS_URL not set');
    redis = new Redis(url, {
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
      commandTimeout: 2000,
      lazyConnect: false,
    });
    redis.on('error', () => {});
  }
  return redis;
}

export type AuditAction =
  | 'patient.list'
  | 'patient.view'
  | 'patient.create'
  | 'patient.update'
  | 'patient.delete'
  | 'patient.import'
  | 'patient.move'
  | 'generate.process'
  | 'generate.analysis'
  | 'generate.referral'
  | 'generate.admission'
  | 'generate.edit'
  | 'clinical.question'
  | 'transcribe'
  | 'billing.update'
  | 'settings.update'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.approve';

interface AuditEntry {
  ts: number;
  userId: string;
  email: string;
  action: AuditAction;
  resource: string;
  detail?: string;
}

const GLOBAL_KEY = 'audit:global';
const userAuditKey = (userId: string) => `audit:user:${userId}`;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Log an audit event. Fire-and-forget — catches all errors.
 */
export async function logAudit(entry: Omit<AuditEntry, 'ts'>): Promise<void> {
  try {
    const r = getAuditRedis();
    const ts = Date.now();
    const record: AuditEntry = { ts, ...entry };
    const value = JSON.stringify(record);

    const pipeline = r.pipeline();
    pipeline.zadd(GLOBAL_KEY, ts, value);
    pipeline.zadd(userAuditKey(entry.userId), ts, value);
    const cutoff = ts - NINETY_DAYS_MS;
    pipeline.zremrangebyscore(GLOBAL_KEY, '-inf', cutoff);
    pipeline.zremrangebyscore(userAuditKey(entry.userId), '-inf', cutoff);
    await pipeline.exec();
  } catch {
    // Never throw — audit logging must not affect request handling
  }
}

/**
 * Query audit log. Returns entries newest-first.
 */
export async function getAuditLog(opts: {
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditEntry[]> {
  const r = getAuditRedis();
  const key = opts.userId ? userAuditKey(opts.userId) : GLOBAL_KEY;
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;

  const results = await r.zrevrangebyscore(
    key, '+inf' as any, '-inf' as any, 'LIMIT', offset, limit,
  );

  return results.map(r => {
    try { return JSON.parse(r); } catch { return null; }
  }).filter(Boolean) as AuditEntry[];
}

/**
 * Convenience: log an audit event using the current session.
 * Fire-and-forget.
 */
export async function audit(action: AuditAction, resource: string, detail?: string): Promise<void> {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId || !session.email) return;
    logAudit({ userId: session.userId, email: session.email, action, resource, detail });
  } catch {
    // Never throw
  }
}
