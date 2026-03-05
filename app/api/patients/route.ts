import { NextRequest, NextResponse } from 'next/server';
import {
  getSheetsContext,
  getPatients,
  updatePatientFields,
  getNextEmptyRow,
  getOrCreateDateSheet,
  getDateSheets,
  getPatientCount,
  getShiftTimes,
  setShiftTimes,
} from '@/lib/google-sheets';

// GET /api/patients?sheet=Mar+03,+2026
export async function GET(request: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const sheetName = request.nextUrl.searchParams.get('sheet') || undefined;
    const listSheets = request.nextUrl.searchParams.get('listSheets');

    // Return available date sheets
    if (listSheets) {
      const sheets = await getDateSheets(ctx);
      return NextResponse.json({ sheets });
    }

    const [patients, shiftTimes] = await Promise.all([
      getPatients(ctx, sheetName),
      getShiftTimes(ctx, sheetName),
    ]);
    return NextResponse.json({ patients, sheetName, shiftTimes });
  } catch (error: any) {
    console.error('Error fetching patients:', error);
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch patients', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

// POST /api/patients - Create new patient (auto-creates today's date sheet)
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const body = await request.json();

    // Ensure today's date sheet exists
    const sheetName = await getOrCreateDateSheet(ctx);

    // Get next empty row and patient count for numbering
    const rowIndex = await getNextEmptyRow(ctx, sheetName);
    const count = await getPatientCount(ctx, sheetName);

    // Add patient number
    body.patientNum = String(count + 1);

    await updatePatientFields(ctx, rowIndex, body, sheetName);

    return NextResponse.json({ success: true, rowIndex, sheetName });
  } catch (error: any) {
    console.error('Error creating patient:', error);
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to create patient', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

// PATCH /api/patients - Update shift times
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const { sheetName, shiftStart, shiftEnd } = await request.json();
    if (!sheetName) {
      return NextResponse.json({ error: 'sheetName required' }, { status: 400 });
    }
    const shiftTimes = await setShiftTimes(ctx, sheetName, shiftStart || '', shiftEnd || '');
    return NextResponse.json({ success: true, shiftTimes });
  } catch (error: any) {
    console.error('Error updating shift times:', error);
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to update shift times', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
