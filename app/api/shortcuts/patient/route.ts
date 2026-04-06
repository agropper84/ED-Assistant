import { NextRequest, NextResponse } from 'next/server';
import { authenticateShortcut, isAuthed } from '@/lib/shortcut-auth';
import { getPatient, updatePatientFields } from '@/lib/google-sheets';

// GET /api/shortcuts/patient?rowIndex=8&sheet=Apr+05,+2026
// Returns full patient data (all fields)
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateShortcut(request);
    if (!isAuthed(auth)) return auth;

    const rowIndex = parseInt(request.nextUrl.searchParams.get('rowIndex') || '0');
    const sheetName = request.nextUrl.searchParams.get('sheet') || undefined;

    if (!rowIndex) {
      return NextResponse.json({ error: 'rowIndex is required' }, { status: 400 });
    }

    const patient = await getPatient(auth.ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    return NextResponse.json(patient);
  } catch (error: any) {
    console.error('Shortcut patient GET error:', error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}

// POST /api/shortcuts/patient — update patient fields
// Body: { rowIndex, sheetName, fields: { transcript: "...", diagnosis: "..." } }
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateShortcut(request);
    if (!isAuthed(auth)) return auth;

    const { rowIndex, sheetName, fields } = await request.json();

    if (!rowIndex || !fields || typeof fields !== 'object') {
      return NextResponse.json({ error: 'rowIndex and fields are required' }, { status: 400 });
    }

    await updatePatientFields(auth.ctx, rowIndex, fields, sheetName);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Shortcut patient POST error:', error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
