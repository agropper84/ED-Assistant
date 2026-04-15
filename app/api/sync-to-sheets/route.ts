import { NextRequest, NextResponse } from 'next/server';
import { getDataContext } from '@/lib/data-layer';
import { getOrCreateDateSheet, updatePatientFields, saveBillingRows } from '@/lib/google-sheets';
import { parseBillingItems } from '@/lib/billing';

/**
 * POST /api/sync-to-sheets
 * One-time backfill: reads all patients from Drive JSON for the given
 * date sheet and writes them to Google Sheets (billing + clinical).
 *
 * Body: { sheetName: "Apr 15, 2026" }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getDataContext();

    if (!ctx.drive) {
      return NextResponse.json(
        { error: 'Drive not configured — nothing to sync from' },
        { status: 400 }
      );
    }

    const { sheetName } = await request.json();
    if (!sheetName) {
      return NextResponse.json({ error: 'sheetName is required' }, { status: 400 });
    }

    // 1. Ensure the Sheets date tab (and clinical companion) exist
    await getOrCreateDateSheet(ctx.sheets, sheetName);

    // 2. Read all patients from Drive
    const dj = await import('@/lib/drive-json');
    const patients = await dj.getPatientsFromDrive(ctx.drive, sheetName);

    if (patients.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No patients found in Drive for this date' });
    }

    let synced = 0;
    const errors: string[] = [];

    for (const patient of patients) {
      try {
        // Build fields map from patient data (skip computed/empty fields)
        const fields: Record<string, string> = {};
        const fieldKeys = [
          'patientNum', 'timestamp', 'name', 'age', 'gender', 'birthday',
          'hcn', 'mrn', 'diagnosis', 'icd9', 'icd10',
          'comments', 'triageVitals', 'transcript', 'encounterNotes',
          'additional', 'pastDocs', 'ddx', 'investigations',
          'hpi', 'objective', 'assessmentPlan', 'referral',
          'synopsis', 'management', 'evidence',
          'apNotes', 'clinicalQA', 'education', 'admission', 'profile',
        ];

        for (const key of fieldKeys) {
          const val = (patient as any)[key];
          if (val) fields[key] = val;
        }

        // Write billing items via saveBillingRows if present
        if (patient.visitProcedure || patient.procCode) {
          try {
            const billingItems = parseBillingItems(
              patient.visitProcedure || '',
              patient.procCode || '',
              patient.fee || '',
              patient.unit || '',
            );
            if (billingItems.length > 0) {
              await saveBillingRows(ctx.sheets, patient.rowIndex, billingItems, sheetName);
            }
          } catch (e) {
            // Fall back to flat field write for billing
            if (patient.visitProcedure) fields.visitProcedure = patient.visitProcedure;
            if (patient.procCode) fields.procCode = patient.procCode;
            if (patient.fee) fields.fee = patient.fee;
            if (patient.unit) fields.unit = patient.unit;
            if (patient.total) fields.total = patient.total;
          }
        }

        // Write all other fields to Sheets (billing + clinical sheets)
        if (Object.keys(fields).length > 0) {
          await updatePatientFields(ctx.sheets, patient.rowIndex, fields, sheetName);
        }

        synced++;
      } catch (e) {
        errors.push(`Row ${patient.rowIndex} (${patient.name}): ${(e as Error).message}`);
      }
    }

    return NextResponse.json({
      synced,
      total: patients.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Sync failed', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
