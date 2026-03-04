import { NextRequest, NextResponse } from 'next/server';
import {
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
    const sheetName = request.nextUrl.searchParams.get('sheet') || undefined;
    const listSheets = request.nextUrl.searchParams.get('listSheets');

    // Return available date sheets
    if (listSheets) {
      const sheets = await getDateSheets();
      return NextResponse.json({ sheets });
    }

    const [patients, shiftTimes] = await Promise.all([
      getPatients(sheetName),
      getShiftTimes(sheetName),
    ]);
    return NextResponse.json({ patients, sheetName, shiftTimes });
  } catch (error: any) {
    console.error('Error fetching patients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patients', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

// POST /api/patients - Create new patient (auto-creates today's date sheet)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Ensure today's date sheet exists
    const sheetName = await getOrCreateDateSheet();

    // Get next empty row and patient count for numbering
    const rowIndex = await getNextEmptyRow(sheetName);
    const count = await getPatientCount(sheetName);

    // Add patient number
    body.patientNum = String(count + 1);

    await updatePatientFields(rowIndex, body, sheetName);

    return NextResponse.json({ success: true, rowIndex, sheetName });
  } catch (error: any) {
    console.error('Error creating patient:', error);
    return NextResponse.json(
      { error: 'Failed to create patient', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

// PATCH /api/patients - Update shift times
export async function PATCH(request: NextRequest) {
  try {
    const { sheetName, shiftStart, shiftEnd, shiftFee } = await request.json();
    if (!sheetName) {
      return NextResponse.json({ error: 'sheetName required' }, { status: 400 });
    }
    const shiftTimes = await setShiftTimes(sheetName, shiftStart || '', shiftEnd || '', shiftFee);
    return NextResponse.json({ success: true, shiftTimes });
  } catch (error: any) {
    console.error('Error updating shift times:', error);
    return NextResponse.json(
      { error: 'Failed to update shift times', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
