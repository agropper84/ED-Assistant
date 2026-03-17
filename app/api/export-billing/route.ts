import { NextRequest, NextResponse } from 'next/server';
import { getSheetsContext, getPatients, readVchBillingSegments } from '@/lib/google-sheets';
import { parseBillingItems, calculateTotal, calculateSegmentHours, getSegmentRatePeriod } from '@/lib/billing';

// GET /api/export-billing?start=2026-03-01&end=2026-03-16&format=yukon|vch
export async function GET(req: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const { searchParams } = new URL(req.url);
    const startStr = searchParams.get('start') || '';
    const endStr = searchParams.get('end') || '';
    const format = searchParams.get('format') || 'yukon';

    if (!startStr || !endStr) {
      return NextResponse.json({ error: 'start and end dates required' }, { status: 400 });
    }

    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid dates' }, { status: 400 });
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let csv: string;

    if (format === 'vch') {
      // VCH Time-Based: read from the VCH Billing sheet, filter by date range
      csv = await exportVchBilling(ctx, startDate, endDate, months);
    } else {
      // Yukon: read per-patient billing items from each day's sheet
      csv = await exportYukonBilling(ctx, startDate, endDate, months);
    }

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="billing-${format}-${startStr}-to-${endStr}.csv"`,
      },
    });
  } catch (err: any) {
    if (err.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Export billing error:', err);
    return NextResponse.json({ error: 'Failed to export billing' }, { status: 500 });
  }
}

async function exportVchBilling(
  ctx: any, startDate: Date, endDate: Date, months: string[]
): Promise<string> {
  const csvRows: string[] = [
    'Service Date,Rate Period,Start Time,End Time,Scheduled/Unscheduled,Onsite/Offsite,Direct+Indirect Hrs,Direct Hrs,Indirect Hrs,Total Hrs',
  ];

  // Generate date strings for the range and read segments for each
  const d = new Date(startDate);
  while (d <= endDate) {
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    const sheetName = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    try {
      const segments = await readVchBillingSegments(ctx, dateStr);
      for (const seg of segments) {
        const hrs = calculateSegmentHours(seg);
        const ratePeriod = getSegmentRatePeriod(seg.start, d.getDay());
        csvRows.push([
          csvEscape(sheetName),
          csvEscape(ratePeriod),
          csvEscape(seg.start),
          csvEscape(seg.end),
          seg.scheduled ? 'Scheduled' : 'Unscheduled',
          seg.onsite ? 'Onsite' : 'Offsite',
          hrs.totalHrs.toFixed(2),
          hrs.directHrs.toFixed(2),
          hrs.indirectHrs.toFixed(2),
          hrs.totalHrs.toFixed(2),
        ].join(','));
      }
    } catch {}

    d.setDate(d.getDate() + 1);
  }

  return csvRows.join('\n');
}

async function exportYukonBilling(
  ctx: any, startDate: Date, endDate: Date, months: string[]
): Promise<string> {
  const csvRows: string[] = [
    'Date,Patient,Timestamp,Visit/Procedure,Proc Code,Fee,Units,Total,Comments',
  ];

  const d = new Date(startDate);
  while (d <= endDate) {
    const sheet = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    try {
      const patients = await getPatients(ctx, sheet);
      for (const p of patients) {
        const items = parseBillingItems(
          p.visitProcedure || '', p.procCode || '',
          p.fee || '', p.unit || '',
        );
        if (items.length === 0) continue;

        const total = calculateTotal(items);
        csvRows.push([
          csvEscape(sheet),
          csvEscape(p.name || ''),
          csvEscape(p.timestamp || ''),
          csvEscape(items.map(i => i.description).join('; ')),
          csvEscape(items.map(i => i.code).join('; ')),
          csvEscape(items.map(i => i.fee).join('; ')),
          csvEscape(items.map(i => i.unit || '1').join('; ')),
          csvEscape(total || ''),
          csvEscape(p.comments || ''),
        ].join(','));
      }
    } catch {}
    d.setDate(d.getDate() + 1);
  }

  return csvRows.join('\n');
}

function csvEscape(val: string): string {
  if (!val) return '';
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
