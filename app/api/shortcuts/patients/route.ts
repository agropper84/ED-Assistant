import { NextRequest, NextResponse } from 'next/server';
import { authenticateShortcut, isAuthed } from '@/lib/shortcut-auth';
import { getPatients, getDateSheets } from '@/lib/data-layer';

// GET /api/shortcuts/patients?sheet=Mar+03,+2026
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateShortcut(request);
    if (!isAuthed(auth)) return auth;

    const sheetName = request.nextUrl.searchParams.get('sheet') || undefined;
    const listSheets = request.nextUrl.searchParams.get('listSheets');

    if (listSheets) {
      const sheets = await getDateSheets(auth.dataCtx);
      return NextResponse.json({ sheets });
    }

    // Default to today's sheet if none specified
    const sheet = sheetName || (await getDateSheets(auth.dataCtx))[0] || '';
    const patients = await getPatients(auth.dataCtx, sheet);
    return NextResponse.json({ patients, sheetName: sheet });
  } catch (error: any) {
    console.error('Shortcut patients error:', error);
    const message = error?.message || 'Failed to fetch patients';
    const status = error?.message?.includes('Not approved') ? 403 :
                   error?.message?.includes('Not authenticated') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
