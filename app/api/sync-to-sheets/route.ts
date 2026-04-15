import { NextRequest, NextResponse } from 'next/server';
import { getDataContext } from '@/lib/data-layer';
import { getOrCreateDateSheet, updatePatientFields, saveBillingRows, getPatients as getSheetsPatients } from '@/lib/google-sheets';
import { parseBillingItems } from '@/lib/billing';

/**
 * POST /api/sync-to-sheets
 * Bidirectional sync for a date sheet:
 *   1. Drive → Sheets: writes all patient data to Google Sheets
 *   2. Sheets → Drive: backfills billing fields that exist in Sheets but not Drive
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

    // 2. Read patients from both Drive and Sheets
    const dj = await import('@/lib/drive-json');
    const drivePatients = await dj.getPatientsFromDrive(ctx.drive, sheetName);
    const sheetsPatients = await getSheetsPatients(ctx.sheets, sheetName);

    let synced = 0;
    let billingBackfilled = 0;
    const errors: string[] = [];

    // --- Phase 1: Drive → Sheets (push all patient data to Sheets) ---
    for (const patient of drivePatients) {
      try {
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

        // Write billing items via saveBillingRows if present in Drive
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
            if (patient.visitProcedure) fields.visitProcedure = patient.visitProcedure;
            if (patient.procCode) fields.procCode = patient.procCode;
            if (patient.fee) fields.fee = patient.fee;
            if (patient.unit) fields.unit = patient.unit;
            if (patient.total) fields.total = patient.total;
          }
        }

        if (Object.keys(fields).length > 0) {
          await updatePatientFields(ctx.sheets, patient.rowIndex, fields, sheetName);
        }

        synced++;
      } catch (e) {
        errors.push(`Drive→Sheets row ${patient.rowIndex} (${patient.name}): ${(e as Error).message}`);
      }
    }

    // --- Phase 2: Sheets → Drive (backfill billing data missing from Drive) ---
    for (const sheetsPatient of sheetsPatients) {
      // Only backfill if Sheets has billing but Drive doesn't
      const sheetsBilling = sheetsPatient.procCode?.trim();
      if (!sheetsBilling) continue;

      const drivePatient = drivePatients.find(
        p => p.rowIndex === sheetsPatient.rowIndex
      );

      const driveBilling = drivePatient?.procCode?.trim();
      if (driveBilling) continue; // Drive already has billing — skip

      try {
        const billingFields: Record<string, string> = {};
        if (sheetsPatient.visitProcedure) billingFields.visitProcedure = sheetsPatient.visitProcedure;
        if (sheetsPatient.procCode) billingFields.procCode = sheetsPatient.procCode;
        if (sheetsPatient.fee) billingFields.fee = sheetsPatient.fee;
        if (sheetsPatient.unit) billingFields.unit = sheetsPatient.unit;
        if (sheetsPatient.total) billingFields.total = sheetsPatient.total;
        if (sheetsPatient.diagnosis) billingFields.diagnosis = sheetsPatient.diagnosis;
        if (sheetsPatient.icd9) billingFields.icd9 = sheetsPatient.icd9;
        if (sheetsPatient.icd10) billingFields.icd10 = sheetsPatient.icd10;

        if (Object.keys(billingFields).length > 0) {
          await dj.updatePatientInDrive(ctx.drive, sheetName, sheetsPatient.rowIndex, billingFields as any);
          billingBackfilled++;
        }
      } catch (e) {
        errors.push(`Sheets→Drive billing row ${sheetsPatient.rowIndex} (${sheetsPatient.name}): ${(e as Error).message}`);
      }
    }

    return NextResponse.json({
      synced,
      billingBackfilled,
      total: drivePatients.length,
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
