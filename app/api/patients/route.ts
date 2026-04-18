import { NextRequest, NextResponse } from 'next/server';
import {
  getDataContext,
  getPatients,
  updatePatientFields,
  getDateSheets,
  getOrCreateDateSheet,
  getNextRowIndex,
  getPatientCount,
  getShiftTimes,
  setShiftTimes,
  searchPatients,
  addPatient,
} from '@/lib/data-layer';
import type { Patient } from '@/lib/google-sheets';

// GET /api/patients?sheet=Mar+03,+2026
export async function GET(request: NextRequest) {
  try {
    const ctx = await getDataContext();
    const sheetName = request.nextUrl.searchParams.get('sheet') || undefined;
    const listSheets = request.nextUrl.searchParams.get('listSheets');
    const search = request.nextUrl.searchParams.get('search')?.toLowerCase().trim();

    // Return available date sheets
    if (listSheets) {
      const sheets = await getDateSheets(ctx);
      return NextResponse.json({ sheets });
    }

    // Cross-sheet search
    if (search) {
      const allSheets = await getDateSheets(ctx);
      const sheetsToSearch = allSheets.slice(0, 30);
      const results = await searchPatients(ctx, sheetsToSearch, search);
      return NextResponse.json({ patients: results, searchQuery: search });
    }

    const [patients, shiftTimes] = await Promise.all([
      getPatients(ctx, sheetName || ''),
      getShiftTimes(ctx, sheetName || ''),
    ]);
    return NextResponse.json({ patients, sheetName, shiftTimes });
  } catch (error: any) {
    console.error('Error fetching patients:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch patients', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

// POST /api/patients - Create new patient (auto-creates date sheet)
export async function POST(request: NextRequest) {
  try {
    const ctx = await getDataContext();
    const body = await request.json();

    // Use specified sheet or default to today
    const sheetName = await getOrCreateDateSheet(ctx, body._sheetName || undefined);
    delete body._sheetName;

    // Get next empty row and patient count for numbering
    const rowIndex = await getNextRowIndex(ctx, sheetName);
    const count = await getPatientCount(ctx, sheetName);

    // Add patient number
    body.patientNum = String(count + 1);

    // Write to data layer (Drive primary + Sheets mirror)
    // updatePatientFields auto-creates the patient in Drive if not found
    await updatePatientFields(ctx, rowIndex, body, sheetName);

    return NextResponse.json({ success: true, rowIndex, sheetName });
  } catch (error: any) {
    console.error('Error creating patient:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
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
    const ctx = await getDataContext();
    const { sheetName, shiftStart, shiftEnd } = await request.json();
    if (!sheetName) {
      return NextResponse.json({ error: 'sheetName required' }, { status: 400 });
    }
    const shiftTimes = await setShiftTimes(ctx, sheetName, shiftStart || '', shiftEnd || '');
    return NextResponse.json({ shiftTimes });
  } catch (error: any) {
    console.error('Error updating shift times:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to update shift times', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
