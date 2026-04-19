import Redis from 'ioredis';
import { encryptValue, decryptValue } from './encryption';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL || process.env.edassistantkv_REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL environment variable is not set');
    }
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      commandTimeout: 3000,
    });
    redis.on('error', () => {}); // Swallow connection errors
  }
  return redis;
}

// --- KV-level secret encryption (encrypts values at rest in Redis) ---

function encryptSecret(value: string): string {
  const key = process.env.KV_ENCRYPTION_KEY;
  if (!key) return value;
  try {
    const buf = Buffer.from(key, 'base64');
    if (buf.length !== 32) return value;
    return encryptValue(value, key);
  } catch {
    return value;
  }
}

function decryptSecret(value: string): string {
  const key = process.env.KV_ENCRYPTION_KEY;
  if (!key) return value;
  try {
    return decryptValue(value, key);
  } catch {
    return value; // Fallback for pre-migration plaintext
  }
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

// --- User refresh token for external device access (encrypted at rest) ---

export async function setUserRefreshToken(userId: string, refreshToken: string): Promise<void> {
  await getRedis().set(`user:${userId}:refresh-token`, encryptSecret(refreshToken));
}

export async function getUserRefreshToken(userId: string): Promise<string | null> {
  const val = await getRedis().get(`user:${userId}:refresh-token`);
  if (!val) return null;
  return decryptSecret(val);
}

// --- User settings (per-user JSON blob for privacy/encryption) ---

export async function getUserSettings(userId: string): Promise<Record<string, unknown> | null> {
  const val = await getRedis().get(`user:${userId}:settings`);
  if (!val) return null;
  return JSON.parse(val);
}

export async function setUserSettings(userId: string, settings: Record<string, unknown>): Promise<void> {
  await getRedis().set(`user:${userId}:settings`, JSON.stringify(settings));
}

// --- Encryption key (per-user, encrypted at rest) ---

export async function getUserEncryptionKey(userId: string): Promise<string | null> {
  const val = await getRedis().get(`user:${userId}:encryption-key`);
  if (!val) return null;
  return decryptSecret(val);
}

export async function setUserEncryptionKey(userId: string, key: string): Promise<void> {
  await getRedis().set(`user:${userId}:encryption-key`, encryptSecret(key));
}

export async function deleteUserEncryptionKey(userId: string): Promise<void> {
  await getRedis().del(`user:${userId}:encryption-key`);
}

// --- API keys (per-user, encrypted at rest) ---

export async function setUserClaudeApiKey(userId: string, apiKey: string): Promise<void> {
  await getRedis().set(`user:${userId}:claude-api-key`, encryptSecret(apiKey));
}

export async function getUserClaudeApiKey(userId: string): Promise<string | null> {
  const val = await getRedis().get(`user:${userId}:claude-api-key`);
  if (!val) return null;
  return decryptSecret(val);
}

export async function setUserOpenAIApiKey(userId: string, apiKey: string): Promise<void> {
  await getRedis().set(`user:${userId}:openai-api-key`, encryptSecret(apiKey));
}

export async function getUserOpenAIApiKey(userId: string): Promise<string | null> {
  const val = await getRedis().get(`user:${userId}:openai-api-key`);
  if (!val) return null;
  return decryptSecret(val);
}

export async function setUserDeepgramApiKey(userId: string, apiKey: string): Promise<void> {
  await getRedis().set(`user:${userId}:deepgram-api-key`, encryptSecret(apiKey));
}

export async function getUserDeepgramApiKey(userId: string): Promise<string | null> {
  const val = await getRedis().get(`user:${userId}:deepgram-api-key`);
  if (!val) return null;
  return decryptSecret(val);
}

export async function setUserWisprApiKey(userId: string, apiKey: string): Promise<void> {
  await getRedis().set(`user:${userId}:wispr-api-key`, encryptSecret(apiKey));
}

export async function getUserWisprApiKey(userId: string): Promise<string | null> {
  const val = await getRedis().get(`user:${userId}:wispr-api-key`);
  if (!val) return null;
  return decryptSecret(val);
}

// --- Storage mode (per-user) ---

export type StorageMode = 'sheets' | 'dual' | 'drive';

export async function getUserStorageMode(userId: string): Promise<StorageMode | null> {
  const val = await getRedis().get(`user:${userId}:storage-mode`);
  if (val === 'sheets' || val === 'dual' || val === 'drive') return val;
  return null;
}

export async function setUserStorageMode(userId: string, mode: StorageMode): Promise<void> {
  await getRedis().set(`user:${userId}:storage-mode`, mode);
}

// --- Drive folder ID cache ---

export async function getUserDriveFolderId(userId: string): Promise<string | null> {
  return getRedis().get(`user:${userId}:drive-folder-id`);
}

export async function setUserDriveFolderId(userId: string, folderId: string): Promise<void> {
  await getRedis().set(`user:${userId}:drive-folder-id`, folderId);
}

export async function getUserPatientsFolderId(userId: string): Promise<string | null> {
  return getRedis().get(`user:${userId}:patients-folder-id`);
}

export async function setUserPatientsFolderId(userId: string, folderId: string): Promise<void> {
  await getRedis().set(`user:${userId}:patients-folder-id`, folderId);
}

// --- Patient submissions (encrypted at rest, per-patient) ---

function submissionsKey(sheetName: string, rowIndex: number): string {
  return `submissions:${sheetName}:${rowIndex}`;
}

export async function getPatientSubmissions(sheetName: string, rowIndex: number): Promise<any[]> {
  const val = await getRedis().get(submissionsKey(sheetName, rowIndex));
  if (!val) return [];
  try {
    return JSON.parse(decryptSecret(val));
  } catch {
    return [];
  }
}

export async function setPatientSubmissions(sheetName: string, rowIndex: number, submissions: any[]): Promise<void> {
  const json = JSON.stringify(submissions);
  await getRedis().set(submissionsKey(sheetName, rowIndex), encryptSecret(json));
}

export async function deletePatientSubmissions(sheetName: string, rowIndex: number): Promise<void> {
  await getRedis().del(submissionsKey(sheetName, rowIndex));
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

// --- Native app OAuth (KV-based state + exchange tokens, no cookies) ---

export async function setNativeAuthState(state: string): Promise<void> {
  await getRedis().set(`native-auth-state:${state}`, '1', 'EX', 600); // 10 min TTL
}

export async function consumeNativeAuthState(state: string): Promise<boolean> {
  const val = await getRedis().get(`native-auth-state:${state}`);
  if (val) {
    await getRedis().del(`native-auth-state:${state}`);
    return true;
  }
  return false;
}

export async function setAuthExchangeToken(token: string, sessionData: string): Promise<void> {
  await getRedis().set(`auth-exchange:${token}`, sessionData, 'EX', 120); // 2 min TTL
}

export async function getAuthExchangeToken(token: string): Promise<string | null> {
  const val = await getRedis().get(`auth-exchange:${token}`);
  if (val) await getRedis().del(`auth-exchange:${token}`); // one-time use
  return val;
}

// --- PIN & TOTP ---

export async function setUserPin(userId: string, pinHash: string): Promise<void> {
  await getRedis().set(`user:${userId}:pin-hash`, encryptSecret(pinHash));
}

export async function getUserPin(userId: string): Promise<string | null> {
  const val = await getRedis().get(`user:${userId}:pin-hash`);
  return val ? decryptSecret(val) : null;
}

export async function deleteUserPin(userId: string): Promise<void> {
  await getRedis().del(`user:${userId}:pin-hash`);
}

export async function setUserTotpSecret(userId: string, secret: string): Promise<void> {
  await getRedis().set(`user:${userId}:totp-secret`, encryptSecret(secret));
}

export async function getUserTotpSecret(userId: string): Promise<string | null> {
  const val = await getRedis().get(`user:${userId}:totp-secret`);
  return val ? decryptSecret(val) : null;
}

export async function deleteUserTotpSecret(userId: string): Promise<void> {
  await getRedis().del(`user:${userId}:totp-secret`);
}
