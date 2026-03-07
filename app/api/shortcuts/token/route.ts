import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { getSessionFromCookies } from '@/lib/session';
import {
  setShortcutTokenHash,
  deleteShortcutTokenHash,
  setUserShortcutTokenHash,
  getUserShortcutTokenHash,
  deleteUserShortcutTokenHash,
  setUserRefreshToken,
} from '@/lib/kv';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// POST — Generate a new shortcut token
export async function POST() {
  const session = await getSessionFromCookies();
  if (!session.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Revoke any existing token first
  const existingHash = await getUserShortcutTokenHash(session.userId);
  if (existingHash) {
    await deleteShortcutTokenHash(existingHash);
    await deleteUserShortcutTokenHash(session.userId);
  }

  // Generate new 64-char hex token
  const rawToken = randomBytes(32).toString('hex');
  const hash = sha256(rawToken);

  // Store hash → userId and userId → hash
  await setShortcutTokenHash(hash, session.userId);
  await setUserShortcutTokenHash(session.userId, hash);

  // Store refresh token for device API access
  if (session.refreshToken) {
    await setUserRefreshToken(session.userId, session.refreshToken);
  }

  return NextResponse.json({ token: rawToken });
}

// GET — Check if user has a token
export async function GET() {
  const session = await getSessionFromCookies();
  if (!session.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const hash = await getUserShortcutTokenHash(session.userId);
  return NextResponse.json({ hasToken: !!hash });
}

// DELETE — Revoke token
export async function DELETE() {
  const session = await getSessionFromCookies();
  if (!session.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const hash = await getUserShortcutTokenHash(session.userId);
  if (hash) {
    await deleteShortcutTokenHash(hash);
    await deleteUserShortcutTokenHash(session.userId);
  }

  return NextResponse.json({ ok: true });
}
