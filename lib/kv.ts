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
