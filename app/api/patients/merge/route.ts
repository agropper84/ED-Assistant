import { NextRequest, NextResponse } from 'next/server';
import { getDataContext, getPatient, updatePatientFields, clearPatient } from '@/lib/data-layer';

// POST /api/patients/merge — Merge one patient's transcript into another
export async function POST(request: NextRequest) {
  try {
    const { sourceRowIndex, targetRowIndex, sheetName } = await request.json();

    if (typeof sourceRowIndex !== 'number' || typeof targetRowIndex !== 'number') {
      return NextResponse.json({ error: 'sourceRowIndex and targetRowIndex are required' }, { status: 400 });
    }

    const ctx = await getDataContext();

    const source = await getPatient(ctx, sourceRowIndex, sheetName);
    const target = await getPatient(ctx, targetRowIndex, sheetName);

    if (!source || !target) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Append source transcript to target
    let mergedTranscript = target.transcript || '';
    if (source.transcript) {
      if (mergedTranscript) {
        mergedTranscript += '\n\n---\n\n' + source.transcript;
      } else {
        mergedTranscript = source.transcript;
      }
    }

    // Update target with merged transcript
    await updatePatientFields(ctx, targetRowIndex, { transcript: mergedTranscript }, sheetName);

    // Clear the source row
    await clearPatient(ctx, sourceRowIndex, sheetName);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Merge error:', error);
    return NextResponse.json({ error: error?.message || 'Merge failed' }, { status: 500 });
  }
}
