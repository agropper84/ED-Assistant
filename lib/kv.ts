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

// --- Shortcut token helpers ---

export async function setShortcutTokenHash(hash: string, userId: string): Promise<void> {
  await getRedis().set(`shortcut-token:${hash}`, userId);
}

export async function getShortcutTokenUser(hash: string): Promise<string | null> {
  return getRedis().get(`shortcut-token:${hash}`);
}

export async function deleteShortcutTokenHash(hash: string): Promise<void> {
  await getRedis().del(`shortcut-token:${hash}`);
}

export async function setUserShortcutTokenHash(userId: string, hash: string): Promise<void> {
  await getRedis().set(`user:${userId}:shortcut-token`, hash);
}

export async function getUserShortcutTokenHash(userId: string): Promise<string | null> {
  return getRedis().get(`user:${userId}:shortcut-token`);
}

export async function deleteUserShortcutTokenHash(userId: string): Promise<void> {
  await getRedis().del(`user:${userId}:shortcut-token`);
}

// --- Shortcut transcript helpers ---

export async function setShortcutTranscript(
  id: string,
  data: { transcript: string; userId: string },
  ttlSeconds: number
): Promise<void> {
  await getRedis().set(`shortcut-transcript:${id}`, JSON.stringify(data), 'EX', ttlSeconds);
}

export async function getShortcutTranscript(id: string): Promise<{ transcript: string; userId: string } | null> {
  const val = await getRedis().get(`shortcut-transcript:${id}`);
  if (!val) return null;
  return JSON.parse(val);
}

export async function deleteShortcutTranscript(id: string): Promise<void> {
  await getRedis().del(`shortcut-transcript:${id}`);
}

// --- User refresh token for external device access ---

export async function setUserRefreshToken(userId: string, refreshToken: string): Promise<void> {
  await getRedis().set(`user:${userId}:refresh-token`, refreshToken);
}

export async function getUserRefreshToken(userId: string): Promise<string | null> {
  return getRedis().get(`user:${userId}:refresh-token`);
}

// --- Pending audio queue for async watch uploads ---

export interface PendingAudio {
  id: string;
  userId: string;
  blobUrl: string;
  filename: string;
  rowIndex?: number;
  sheetName?: string;
  append?: boolean;
  mode?: string; // 'transcribe' | 'analyze' | 'full' | 'quick'
  createdAt: string;
}

export async function addPendingAudio(data: PendingAudio): Promise<void> {
  const key = `pending-audio:${data.id}`;
  await getRedis().set(key, JSON.stringify(data), 'EX', 3600); // 1 hour TTL
  await getRedis().sadd(`pending-audio-list:${data.userId}`, data.id);
  await getRedis().expire(`pending-audio-list:${data.userId}`, 3600);
}

export async function getPendingAudioIds(userId: string): Promise<string[]> {
  return getRedis().smembers(`pending-audio-list:${userId}`);
}

export async function getPendingAudio(id: string): Promise<PendingAudio | null> {
  const val = await getRedis().get(`pending-audio:${id}`);
  if (!val) return null;
  return JSON.parse(val);
}

export async function deletePendingAudio(id: string, userId: string): Promise<void> {
  await getRedis().del(`pending-audio:${id}`);
  await getRedis().srem(`pending-audio-list:${userId}`, id);
}
