import { NextRequest, NextResponse } from 'next/server';
import { processEncounter, lookupICDCodes } from '@/lib/claude';
import { getPatient, updatePatientFields } from '@/lib/google-sheets';

// POST /api/process - Process patient encounter with Claude
export async function POST(request: NextRequest) {
  try {
    const { rowIndex } = await request.json();
    
    // Get patient data
    const patient = await getPatient(rowIndex);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }
    
    // Process with Claude
    const result = await processEncounter({
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      birthday: patient.birthday,
      triageVitals: patient.triageVitals,
      transcript: patient.transcript,
      additional: patient.additional,
    });
    
    // Update the sheet
    await updatePatientFields(rowIndex, {
      ddx: result.ddx,
      investigations: result.investigations,
      hpi: result.hpi,
      objective: result.objective,
      assessmentPlan: result.assessmentPlan,
      diagnosis: result.diagnosis,
    });
    
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Error processing encounter:', error);
    return NextResponse.json(
      { error: 'Failed to process encounter' },
      { status: 500 }
    );
  }
}
