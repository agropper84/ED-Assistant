import { NextRequest, NextResponse } from 'next/server';
import { getDataContext } from '@/lib/data-layer';
import { getSessionFromCookies } from '@/lib/session';

export const maxDuration = 300;

const ALLOWED_DATES = [
  'Aug 18, 2026',
  'Aug 19, 2026',
  'Aug 20, 2026',
  'Aug 21, 2026',
  'Aug 22, 2026',
  'Aug 23, 2026',
];

// POST /api/clear-date-patients
// Clears all patients from the hardcoded Aug 18-23 date sheets in both Drive and Sheets.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const ctx = await getDataContext();
    const results: string[] = [];

    for (const sheetName of ALLOWED_DATES) {
      try {
        // Clear Drive JSON for this date
        if (ctx.drive) {
          const dj = await import('@/lib/drive-json');
          const dateSheet = await dj.getDateSheetFromDrive(ctx.drive, sheetName);
          if (dateSheet) {
            const count = dateSheet.patients.length;
            dateSheet.patients = [];
            await dj.saveDateSheetToDrive(ctx.drive, dateSheet);
            results.push(`Drive ${sheetName}: cleared ${count} patients`);
          } else {
            results.push(`Drive ${sheetName}: no file found`);
          }
        }

        // Clear Sheets rows (rows 8-200) for this date
        const { sheets, spreadsheetId } = ctx.sheets;
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetExists = spreadsheet.data.sheets?.some(
          (s: any) => s.properties?.title === sheetName
        );
        if (sheetExists) {
          await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `'${sheetName}'!A8:AJ200`,
          });
          results.push(`Sheets ${sheetName}: rows 8-200 cleared`);
        } else {
          results.push(`Sheets ${sheetName}: sheet not found`);
        }
      } catch (e: any) {
        results.push(`ERROR ${sheetName}: ${e?.message}`);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('[clear-date-patients] Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
