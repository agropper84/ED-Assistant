import Redis from 'ioredis';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL || process.env.edassistantkv_REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL environment variable is not set');
    }
    redis = new Redis(url);
  }
  return redis;
}

function userKey(userId: string): string {
  return `user:${userId}:spreadsheet`;
}

export async function getUserSpreadsheetId(userId: string): Promise<string | null> {
  return getRedis().get(userKey(userId));
}

export async function setUserSpreadsheetId(userId: string, spreadsheetId: string): Promise<void> {
  await getRedis().set(userKey(userId), spreadsheetId);
}

// --- User status & info for approval system ---

function statusKey(userId: string): string {
  return `user:${userId}:status`;
}

function infoKey(userId: string): string {
  return `user:${userId}:info`;
}

export async function getUserStatus(userId: string): Promise<'approved' | 'pending' | null> {
  const val = await getRedis().get(statusKey(userId));
  if (val === 'approved' || val === 'pending') return val;
  return null;
}

export async function setUserStatus(userId: string, status: 'approved' | 'pending'): Promise<void> {
  await getRedis().set(statusKey(userId), status);
}

export async function setUserInfo(userId: string, info: { email: string; name: string }): Promise<void> {
  await getRedis().set(infoKey(userId), JSON.stringify(info));
}

export async function getUserInfo(userId: string): Promise<{ email: string; name: string } | null> {
  const val = await getRedis().get(infoKey(userId));
  if (!val) return null;
  return JSON.parse(val);
}
