/**
 * Simple Redis-based rate limiting using fixed windows.
 * Key: ratelimit:{userId}:{endpoint} with TTL = windowSec.
 */

import Redis from 'ioredis';

let redis: Redis | null = null;

function getRateLimitRedis(): Redis {
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

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

/**
 * Check and increment rate limit counter.
 * Returns { allowed, remaining, limit }.
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  limit: number = 10,
  windowSec: number = 60
): Promise<RateLimitResult> {
  try {
    const key = `ratelimit:${userId}:${endpoint}`;
    const r = getRateLimitRedis();
    const current = await r.incr(key);
    if (current === 1) {
      await r.expire(key, windowSec);
    }
    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
      limit,
    };
  } catch {
    // On Redis failure, allow the request (fail open)
    return { allowed: true, remaining: limit, limit };
  }
}
