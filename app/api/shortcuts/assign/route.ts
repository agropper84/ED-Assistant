import { NextRequest, NextResponse } from 'next/server';
import { authenticateShortcut, isAuthed } from '@/lib/shortcut-auth';
import { getPatient, updatePatientFields } from '@/lib/data-layer';

export const maxDuration = 15;

// POST /api/shortcuts/assign — Assign a transcript to an existing patient
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateShortcut(request);
    if (!isAuthed(auth)) return auth;

    const { rowIndex, sheetName, transcript, append } = await request.json();

    if (!rowIndex || !transcript) {
      return NextResponse.json({ error: 'rowIndex and transcript are required' }, { status: 400 });
    }

    const dataCtx = auth.dataCtx;

    if (append) {
      const patient = await getPatient(dataCtx, rowIndex, sheetName);
      const existing = patient?.transcript || '';
      const combined = existing ? `${existing}\n\n---\n\n${transcript}` : transcript;
      await updatePatientFields(dataCtx, rowIndex, { transcript: combined }, sheetName);
    } else {
      await updatePatientFields(dataCtx, rowIndex, { transcript }, sheetName);
    }

    return NextResponse.json({ success: true, rowIndex });
  } catch (error: any) {
    console.error('Shortcut assign error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to assign transcript' },
      { status: 500 }
    );
  }
}
