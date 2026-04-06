import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getShortcutTokenUser } from '@/lib/kv';
import { getSheetsContextForUser, SheetsContext } from '@/lib/google-sheets';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Authenticate a shortcut/native app request via Bearer token.
 * Returns { userId, ctx } on success, or a NextResponse error on failure.
 */
export async function authenticateShortcut(request: NextRequest): Promise<
  { userId: string; ctx: SheetsContext } | NextResponse
> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const hash = sha256(token);
  const userId = await getShortcutTokenUser(hash);

  if (!userId) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  try {
    const ctx = await getSheetsContextForUser(userId);
    return { userId, ctx };
  } catch (error: any) {
    const message = error?.message || 'Auth failed';
    const status = message.includes('Not approved') ? 403 :
                   message.includes('Not authenticated') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** Type guard: is the result an auth success (not an error response)? */
export function isAuthed(result: { userId: string; ctx: SheetsContext } | NextResponse): result is { userId: string; ctx: SheetsContext } {
  return !(result instanceof NextResponse);
}
