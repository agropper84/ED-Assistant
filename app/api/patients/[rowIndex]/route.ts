import { NextRequest, NextResponse } from 'next/server';
import { getPatient, updatePatientFields } from '@/lib/google-sheets';

// GET /api/patients/[rowIndex]
export async function GET(
  request: NextRequest,
  { params }: { params: { rowIndex: string } }
) {
  try {
    const rowIndex = parseInt(params.rowIndex);
    const patient = await getPatient(rowIndex);
    
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }
    
    return NextResponse.json({ patient });
  } catch (error) {
    console.error('Error fetching patient:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patient' },
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
    
    await updatePatientFields(rowIndex, body);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating patient:', error);
    return NextResponse.json(
      { error: 'Failed to update patient' },
      { status: 500 }
    );
  }
}
