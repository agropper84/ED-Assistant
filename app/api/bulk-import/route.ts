import { NextRequest, NextResponse } from 'next/server';
import { getDataContext, getOrCreateDateSheet, getNextRowIndex, updatePatientFields } from '@/lib/data-layer';
import type { Patient } from '@/lib/google-sheets';

export const maxDuration = 300;

interface ImportPatient {
  name: string;
  timestamp: string;
  age: string;
  gender: string;
  birthday: string;
  hcn: string;
  diagnosis: string;
  icd10: string;
  comments: string;
}

interface ImportDay {
  sheetName: string;
  patients: ImportPatient[];
}

function makePatient(p: ImportPatient, sheetName: string, rowIndex: number, num: number): Patient {
  return {
    rowIndex,
    sheetName,
    patientNum: String(num),
    timestamp: p.timestamp,
    name: p.name,
    age: p.age,
    gender: p.gender,
    birthday: p.birthday,
    hcn: p.hcn,
    mrn: '',
    diagnosis: p.diagnosis,
    icd9: '',
    icd10: p.icd10,
    visitProcedure: '',
    procCode: '',
    fee: '',
    unit: '',
    total: '',
    comments: p.comments || '',
    triageVitals: '',
    transcript: '',
    additional: '',
    ddx: '',
    investigations: '',
    hpi: '',
    objective: '',
    assessmentPlan: '',
    referral: '',
    pastDocs: '',
    synopsis: '',
    management: '',
    evidence: '',
    apNotes: '',
    clinicalQA: '',
    education: '',
    encounterNotes: '',
    admission: '',
    profile: '',
    room: '',
    audioBackup: '',
    status: 'new',
  } as Patient;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getDataContext();
    const { days } = await request.json() as { days: ImportDay[] };

    if (!days || !Array.isArray(days)) {
      return NextResponse.json({ error: 'days array required' }, { status: 400 });
    }

    let totalImported = 0;
    const results: string[] = [];

    for (const day of days) {
      const { sheetName, patients } = day;
      if (!sheetName || !patients?.length) continue;

      // Ensure sheet exists in both Sheets and Drive
      await getOrCreateDateSheet(ctx, sheetName);

      for (let i = 0; i < patients.length; i++) {
        // Use the same row-index logic as manual patient creation
        const rowIndex = await getNextRowIndex(ctx, sheetName);
        const patient = makePatient(patients[i], sheetName, rowIndex, i + 1);

        try {
          // Use the same write path as manual patient creation (Drive + optional Sheets mirror)
          const fields: Record<string, string> = {};
          for (const [k, v] of Object.entries(patient)) {
            if (typeof v === 'string') fields[k] = v;
          }
          await updatePatientFields(ctx, rowIndex, fields, sheetName, patient.name);

          // Always write to Sheets for import (ensures Sheets is current as fallback)
          const gs = await import('@/lib/google-sheets');
          await gs.updatePatientFields(ctx.sheets, rowIndex, fields, sheetName);

          totalImported++;
        } catch (e: any) {
          console.error(`[import] Failed ${patients[i].name}:`, e?.message);
          results.push(`FAILED: ${patients[i].name} - ${e?.message}`);
        }
      }

      results.push(`${sheetName}: ${patients.length} patients`);
    }

    console.log(`[bulk-import] Imported ${totalImported} patients`);
    return NextResponse.json({ success: true, imported: totalImported, details: results });
  } catch (error: any) {
    console.error('[bulk-import] Error:', error);
    return NextResponse.json({ error: error?.message || 'Import failed' }, { status: 500 });
  }
}
