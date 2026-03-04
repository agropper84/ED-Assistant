import { NextRequest, NextResponse } from 'next/server';
import { getPatients, updatePatientFields, getNextEmptyRow } from '@/lib/google-sheets';

// GET /api/patients - Fetch all patients
export async function GET() {
  try {
    const patients = await getPatients();
    return NextResponse.json({ patients });
  } catch (error) {
    console.error('Error fetching patients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patients' },
      { status: 500 }
    );
  }
}

// POST /api/patients - Create new patient
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rowIndex = await getNextEmptyRow();
    
    await updatePatientFields(rowIndex, body);
    
    return NextResponse.json({ success: true, rowIndex });
  } catch (error) {
    console.error('Error creating patient:', error);
    return NextResponse.json(
      { error: 'Failed to create patient' },
      { status: 500 }
    );
  }
}
