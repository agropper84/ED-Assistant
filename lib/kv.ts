import { kv } from '@vercel/kv';

function userKey(userId: string): string {
  return `user:${userId}:spreadsheet`;
}

export async function getUserSpreadsheetId(userId: string): Promise<string | null> {
  return kv.get<string>(userKey(userId));
}

export async function setUserSpreadsheetId(userId: string, spreadsheetId: string): Promise<void> {
  await kv.set(userKey(userId), spreadsheetId);
}
