import { NextRequest, NextResponse } from 'next/server';
import { authenticateShortcut, isAuthed } from '@/lib/shortcut-auth';
import { getPatients, getOrCreateDateSheet, updatePatientFields } from '@/lib/data-layer';

// POST /api/shortcuts/quick-encounter — Create a new patient/encounter row
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateShortcut(request);
    if (!isAuthed(auth)) return auth;

    const body = await request.json();
    const { transcript, name: patientName, age, gender, triageVitals } = body;

    if (!transcript && !patientName) {
      return NextResponse.json({ error: 'transcript or name is required' }, { status: 400 });
    }

    const dataCtx = auth.dataCtx;

    // Ensure today's sheet exists
    const sheetName = await getOrCreateDateSheet(dataCtx, '');

    // Get existing patients to determine next row + numbering
    const existing = await getPatients(dataCtx, sheetName);
    const encounterNum = existing.length + 1;
    const encounterName = patientName || `New Encounter ${encounterNum}`;

    // Calculate next row index (data starts at row 8)
    const DATA_START_ROW = 8;
    let rowIndex = DATA_START_ROW;
    if (existing.length > 0) {
      // Find the max row index + 1
      const maxRow = Math.max(...existing.map(p => p.rowIndex));
      rowIndex = maxRow + 1;
    }

    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Toronto',
    });

    const fields: Record<string, string> = {
      patientNum: String(encounterNum),
      name: encounterName,
      timestamp,
    };
    if (transcript) fields.transcript = transcript;
    if (age) fields.age = age;
    if (gender) fields.gender = gender;
    if (triageVitals) fields.triageVitals = triageVitals;

    await updatePatientFields(dataCtx, rowIndex, fields, sheetName);

    return NextResponse.json({
      success: true,
      rowIndex,
      sheetName,
      name: encounterName,
    });
  } catch (error: any) {
    console.error('Quick encounter error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create encounter' },
      { status: error?.message?.includes('Not approved') ? 403 : 500 }
    );
  }
}
