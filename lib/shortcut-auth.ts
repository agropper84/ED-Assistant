import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getShortcutTokenUser } from '@/lib/kv';
import { getDataContextForUser } from '@/lib/data-layer';
import type { DataContext } from '@/lib/types-json';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Authenticate a shortcut/native app request via Bearer token.
 * Returns { userId, dataCtx } on success, or a NextResponse error on failure.
 * Uses the data-layer abstraction (Drive + Sheets) instead of Sheets-only.
 */
export async function authenticateShortcut(request: NextRequest): Promise<
  { userId: string; dataCtx: DataContext } | NextResponse
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
    const dataCtx = await getDataContextForUser(userId);
    return { userId, dataCtx };
  } catch (error: any) {
    const message = error?.message || 'Auth failed';
    const status = message.includes('Not approved') ? 403 :
                   message.includes('Not authenticated') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** Type guard: is the result an auth success (not an error response)? */
export function isAuthed(result: { userId: string; dataCtx: DataContext } | NextResponse): result is { userId: string; dataCtx: DataContext } {
  return !(result instanceof NextResponse);
}
