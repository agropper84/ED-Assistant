import { NextRequest, NextResponse } from 'next/server';
import { authenticateShortcut, isAuthed } from '@/lib/shortcut-auth';
import { deletePatient } from '@/lib/data-layer';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateShortcut(request);
    if (!isAuthed(auth)) return auth;

    const { rowIndex, sheetName } = await request.json();
    if (typeof rowIndex !== 'number' || !sheetName) {
      return NextResponse.json({ error: 'rowIndex and sheetName are required' }, { status: 400 });
    }

    await deletePatient(auth.dataCtx, rowIndex, sheetName);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete patient error:', error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
