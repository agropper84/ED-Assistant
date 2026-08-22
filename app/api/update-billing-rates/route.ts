import { NextRequest, NextResponse } from 'next/server';
import { yukonFee } from '@/lib/billing';

export const maxDuration = 120;

/**
 * POST /api/update-billing-rates
 * Retroactively updates all patient billing fees from a given date onwards
 * to match the current YUKON_CODES fee schedule.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const sinceDate = body.since || '2026-04-01';

    // Use session-based getDriveContext (uses iron-session cookie, not KV refresh token)
    const dj = await import('@/lib/drive-json');
    const ctx = await dj.getDriveContext();

    // Get master index to find all date sheets
    const masterIndex = await dj.getMasterIndex(ctx);
    if (!masterIndex || !masterIndex.sheets.length) {
      return NextResponse.json({ error: 'No date sheets found' }, { status: 404 });
    }

    const sinceMs = new Date(sinceDate).getTime();

    let totalPatients = 0;
    let updatedPatients = 0;
    let updatedSheets = 0;
    let totalFeesChanged = 0;
    const details: string[] = [];

    for (const sheetName of masterIndex.sheets) {
      // Parse sheet name like "Aug 21, 2026" into a Date
      const sheetDate = new Date(sheetName);
      if (isNaN(sheetDate.getTime()) || sheetDate.getTime() < sinceMs) continue;

      const dateSheet = await dj.getDateSheetFromDrive(ctx, sheetName);
      if (!dateSheet || !dateSheet.patients.length) continue;

      let sheetModified = false;

      for (const patient of dateSheet.patients) {
        totalPatients++;
        const d = patient.data;
        const procCodes = (d.procCode || '').split('\n').map((s: string) => s.trim());
        const fees = (d.fee || '').split('\n').map((s: string) => s.trim());

        if (procCodes.length === 0 || !procCodes[0]) continue;

        let patientModified = false;
        const newFees: string[] = [];

        for (let i = 0; i < procCodes.length; i++) {
          const code = procCodes[i];
          const oldFee = fees[i] || '';
          const newFee = yukonFee(code);

          if (newFee && newFee !== oldFee) {
            newFees.push(newFee);
            patientModified = true;
            totalFeesChanged++;
          } else {
            newFees.push(oldFee);
          }
        }

        if (patientModified) {
          d.fee = newFees.join('\n');
          // Recalculate total
          const units = (d.unit || '').split('\n').map((s: string) => s.trim());
          let grandTotal = 0;
          for (let i = 0; i < newFees.length; i++) {
            const f = parseFloat(newFees[i]) || 0;
            const u = parseInt(units[i] || '1') || 1;
            grandTotal += f * u;
          }
          d.total = grandTotal > 0 ? grandTotal.toFixed(2) : '';
          updatedPatients++;
          sheetModified = true;
        }
      }

      if (sheetModified) {
        dateSheet.lastModified = new Date().toISOString();
        await dj.saveDateSheetToDrive(ctx, dateSheet);
        updatedSheets++;
        details.push(`${sheetName}: updated`);
      }
    }

    const summary = `Updated ${updatedPatients}/${totalPatients} patients across ${updatedSheets} sheets. ${totalFeesChanged} individual fees changed.`;
    console.log(`[update-billing-rates] ${summary}`);

    return NextResponse.json({
      success: true,
      summary,
      since: sinceDate,
      totalPatients,
      updatedPatients,
      updatedSheets,
      totalFeesChanged,
      details,
    });
  } catch (error: any) {
    console.error('[update-billing-rates] Error:', error);
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ error: error?.message || 'Failed to update rates' }, { status: 500 });
  }
}
