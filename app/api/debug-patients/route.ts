import { NextRequest, NextResponse } from 'next/server';
import { getDataContext } from '@/lib/data-layer';

/**
 * GET /api/debug-patients?sheet=Apr+18,+2026
 * Diagnostic endpoint: shows raw Drive JSON patient data for a date sheet.
 * Returns rowIndex, name, field counts, and submissions for each entry.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getDataContext();
    const sheetName = request.nextUrl.searchParams.get('sheet') || '';

    const result: any = {
      sheetName,
      mode: ctx.mode,
      hasDrive: !!ctx.drive,
      drive: null as any,
      sheets: null as any,
    };

    // Read raw Drive data
    if (ctx.drive) {
      try {
        const dj = await import('@/lib/drive-json');
        const dateSheet = await dj.getDateSheetFromDrive(ctx.drive, sheetName);
        if (dateSheet) {
          result.drive = {
            patientCount: dateSheet.patients.length,
            lastModified: dateSheet.lastModified,
            patients: dateSheet.patients.map((p, i) => ({
              index: i,
              rowIndex: p.rowIndex,
              rowIndexType: typeof p.rowIndex,
              name: p.data.name || '(empty)',
              patientId: p.patientId,
              lastModified: p.lastModified,
              submissionCount: p.submissions?.length || 0,
              nonEmptyFields: Object.entries(p.data).filter(([_, v]) => v && String(v).trim()).map(([k]) => k),
            })),
          };
        } else {
          result.drive = { error: 'No date sheet file found in Drive for this sheet name' };
        }
      } catch (e) {
        result.drive = { error: (e as Error).message };
      }
    }

    // Read Sheets data for comparison
    try {
      const gs = await import('@/lib/google-sheets');
      const sheetsPatients = await gs.getPatients(ctx.sheets, sheetName);
      result.sheets = {
        patientCount: sheetsPatients.length,
        patients: sheetsPatients.map(p => ({
          rowIndex: p.rowIndex,
          name: p.name || '(empty)',
          hasTranscript: !!p.transcript,
          hasDiagnosis: !!p.diagnosis,
        })),
      };
    } catch (e) {
      result.sheets = { error: (e as Error).message };
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
