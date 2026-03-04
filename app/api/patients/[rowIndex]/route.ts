import { NextRequest, NextResponse } from 'next/server';
import { getPatient, updatePatientFields, clearPatientRow } from '@/lib/google-sheets';

// GET /api/patients/[rowIndex]?sheet=Mar+03,+2026
export async function GET(
  request: NextRequest,
  { params }: { params: { rowIndex: string } }
) {
  try {
    const rowIndex = parseInt(params.rowIndex);
    const sheetName = request.nextUrl.searchParams.get('sheet') || undefined;
    const patient = await getPatient(rowIndex, sheetName);

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    return NextResponse.json({ patient });
  } catch (error: any) {
    console.error('Error fetching patient:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patient', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

// PATCH /api/patients/[rowIndex] - Update patient fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: { rowIndex: string } }
) {
  try {
    const rowIndex = parseInt(params.rowIndex);
    const body = await request.json();
    const { _sheetName, ...fields } = body;

    await updatePatientFields(rowIndex, fields, _sheetName || undefined);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating patient:', error);
    return NextResponse.json(
      { error: 'Failed to update patient', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/patients/[rowIndex]?sheet=Mar+03,+2026
export async function DELETE(
  request: NextRequest,
  { params }: { params: { rowIndex: string } }
) {
  try {
    const rowIndex = parseInt(params.rowIndex);
    const sheetName = request.nextUrl.searchParams.get('sheet') || undefined;

    await clearPatientRow(rowIndex, sheetName);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting patient:', error);
    return NextResponse.json(
      { error: 'Failed to delete patient', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
