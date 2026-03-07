import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getShortcutTokenUser } from '@/lib/kv';
import { getSheetsContextForUser, getPatients, getDateSheets } from '@/lib/google-sheets';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// GET /api/shortcuts/patients?sheet=Mar+03,+2026
export async function GET(request: NextRequest) {
  try {
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

    const ctx = await getSheetsContextForUser(userId);
    const sheetName = request.nextUrl.searchParams.get('sheet') || undefined;
    const listSheets = request.nextUrl.searchParams.get('listSheets');

    if (listSheets) {
      const sheets = await getDateSheets(ctx);
      return NextResponse.json({ sheets });
    }

    const patients = await getPatients(ctx, sheetName);
    return NextResponse.json({ patients, sheetName });
  } catch (error: any) {
    console.error('Shortcut patients error:', error);
    const message = error?.message || 'Failed to fetch patients';
    const status = error?.message?.includes('Not approved') ? 403 :
                   error?.message?.includes('Not authenticated') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
