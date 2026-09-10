import { NextRequest, NextResponse } from 'next/server';
import { getDataContext, getPatients, getShiftTimes } from '@/lib/data-layer';
import { dateToSheetName, getSupplementalLines } from '@/lib/google-sheets';
import { parseBillingItems } from '@/lib/billing';

// GET /api/billing-total?start=2026-03-01&end=2026-03-16
export async function GET(req: NextRequest) {
  try {
    const ctx = await getDataContext();
    const { searchParams } = new URL(req.url);
    const startStr = searchParams.get('start') || '';
    const endStr = searchParams.get('end') || '';

    if (!startStr || !endStr) {
      return NextResponse.json({ error: 'start and end dates required' }, { status: 400 });
    }

    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid dates' }, { status: 400 });
    }

    let totalVisitFees = 0;
    let totalShiftFees = 0;
    let totalSupplementalFees = 0;
    let daysWithData = 0;

    // Iterate each day in the range
    const d = new Date(startDate);
    d.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (d <= end) {
      const sheetName = dateToSheetName(d);
      try {
        // Patient visit fees
        const patients = await getPatients(ctx, sheetName);
        for (const p of patients) {
          const items = parseBillingItems(p.visitProcedure || '', p.procCode || '', p.fee || '', p.unit || '');
          totalVisitFees += items.reduce((s, item) => s + (parseFloat(item.fee) || 0) * (parseInt(item.unit) || 1), 0);
        }

        // Shift fees
        const shift = await getShiftTimes(ctx, sheetName);
        totalShiftFees += parseFloat(shift.total) || 0;

        // Supplemental fees
        const supLines = await getSupplementalLines(ctx.sheets, sheetName);
        totalSupplementalFees += supLines.reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0);

        if (patients.length > 0 || shift.start || supLines.length > 0) daysWithData++;
      } catch {
        // Sheet doesn't exist for this date — skip
      }

      d.setDate(d.getDate() + 1);
    }

    return NextResponse.json({
      visitFees: totalVisitFees,
      shiftFees: totalShiftFees,
      supplementalFees: totalSupplementalFees,
      total: totalVisitFees + totalShiftFees + totalSupplementalFees,
      days: daysWithData,
    });
  } catch (error: any) {
    if (error?.message?.includes('Not authenticated')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Billing total error:', error);
    return NextResponse.json({ error: 'Failed to calculate total' }, { status: 500 });
  }
}
