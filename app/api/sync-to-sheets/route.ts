import { NextRequest, NextResponse } from 'next/server';
import { getDataContext } from '@/lib/data-layer';
import { getOrCreateDateSheet, updatePatientFields, saveBillingRows, DATA_START_ROW } from '@/lib/google-sheets';
import { parseBillingItems } from '@/lib/billing';

export const maxDuration = 60;

/**
 * POST /api/sync-to-sheets
 * One-way sync: Drive JSON → Google Sheets.
 * Clears the sheet first, then writes each patient with proper billing continuation rows.
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

    // Ensure the Sheets date tab exists
    await getOrCreateDateSheet(ctx.sheets, sheetName);

    // Read all patients from Drive JSON (source of truth)
    const dj = await import('@/lib/drive-json');
    const drivePatients = await dj.getPatientsFromDrive(ctx.drive, sheetName);
    const { sheets, spreadsheetId } = ctx.sheets;

    // Write shift times to row 5 (read from current Sheets state since shift times
    // are managed via the dashboard header controls, not stored in Drive JSON)
    try {
      const { getShiftTimes } = await import('@/lib/google-sheets');
      const shift = await getShiftTimes(ctx.sheets, sheetName);
      if (shift.start || shift.end) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${sheetName}'!A5:G5`,
          valueInputOption: 'RAW',
          requestBody: { values: [[shift.start, shift.end, shift.hours, shift.feeType, shift.code, shift.fee, shift.total]] },
        });
      }
    } catch {}

    if (drivePatients.length === 0) {
      return NextResponse.json({ synced: 0, total: 0 });
    }

    // Clear the billing sheet data area (keep headers in rows 1-7, only columns A-Q)
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `'${sheetName}'!A${DATA_START_ROW}:Q500`,
      });
    } catch {}

    let synced = 0;
    const errors: string[] = [];

    // Write each patient sequentially — row position shifts as continuation rows are added
    let currentRow = DATA_START_ROW;

    for (const patient of drivePatients) {
      try {
        // Parse billing items from Drive JSON's serialized format
        const billingItems = parseBillingItems(
          patient.visitProcedure || '',
          patient.procCode || '',
          patient.fee || '',
          patient.unit || '',
        );

        // Calculate total
        const total = billingItems.reduce((sum, item) => {
          const f = parseFloat(item.fee) || 0;
          const u = parseInt(item.unit || '1') || 1;
          return sum + f * u;
        }, 0);

        // Build patient row data (columns A-Q)
        const patientRow = [
          patient.patientNum || '',   // A: #
          patient.timestamp || '',     // B: Time
          patient.name || '',          // C: Patient Name
          patient.age || '',           // D: Age
          patient.gender || '',        // E: Gender
          patient.birthday || '',      // F: DOB
          patient.hcn || '',           // G: HCN
          patient.mrn || '',           // H: MRN
          patient.diagnosis || '',     // I: Diagnosis
          patient.icd9 || '',          // J: ICD-9
          patient.icd10 || '',         // K: ICD-10
          billingItems[0]?.description || '', // L: Procedure (first item)
          billingItems[0]?.code || '',        // M: Code (first item)
          billingItems[0]?.fee || '',         // N: Fee (first item)
          billingItems[0]?.unit || '1',       // O: Unit (first item)
          total > 0 ? total.toFixed(2) : '',  // P: Total
          patient.comments || '',      // Q: Comments
        ];

        // Write patient row
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${sheetName}'!A${currentRow}`,
          valueInputOption: 'RAW',
          requestBody: { values: [patientRow] },
        });

        // Write continuation rows for additional billing items (one per row)
        for (let i = 1; i < billingItems.length; i++) {
          const contRow = [
            '', '', '', '', '', '', '', '', '', '', '', // A-K: empty
            billingItems[i].description || '',  // L: Procedure
            billingItems[i].code || '',         // M: Code
            billingItems[i].fee || '',          // N: Fee
            billingItems[i].unit || '1',        // O: Unit
            '',                                 // P: Total (blank for continuation)
            '',                                 // Q: Comments
          ];
          currentRow++;
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `'${sheetName}'!A${currentRow}`,
            valueInputOption: 'RAW',
            requestBody: { values: [contRow] },
          });
        }

        currentRow++;
        synced++;
      } catch (e) {
        errors.push(`${patient.name}: ${(e as Error).message}`);
        currentRow++;
      }
    }

    // Write clinical data to companion sheet only (not the billing sheet)
    const { clinicalSheetName } = await import('@/lib/google-sheets');
    const clinSheet = clinicalSheetName(sheetName);
    for (const patient of drivePatients) {
      try {
        const CLINICAL_COLS: Record<string, string> = {
          triageVitals: 'C', transcript: 'D', encounterNotes: 'E', additional: 'F',
          pastDocs: 'G', ddx: 'H', investigations: 'I', hpi: 'J',
          objective: 'K', assessmentPlan: 'L', referral: 'M',
          synopsis: 'N', management: 'O', evidence: 'P',
          apNotes: 'Q', clinicalQA: 'R', education: 'S',
          admission: 'T', profile: 'U',
        };
        const data: Array<{ range: string; values: string[][] }> = [];
        // Identity columns
        data.push({ range: `'${clinSheet}'!A${patient.rowIndex}`, values: [[patient.name || '']] });
        data.push({ range: `'${clinSheet}'!B${patient.rowIndex}`, values: [[patient.hcn || '']] });
        for (const [key, col] of Object.entries(CLINICAL_COLS)) {
          const val = (patient as any)[key];
          if (val) data.push({ range: `'${clinSheet}'!${col}${patient.rowIndex}`, values: [[val]] });
        }
        if (data.length > 0) {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: { valueInputOption: 'RAW', data },
          });
        }
      } catch {}
    }

    return NextResponse.json({
      synced,
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
