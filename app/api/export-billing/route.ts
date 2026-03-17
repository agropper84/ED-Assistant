import { NextRequest, NextResponse } from 'next/server';
import { getSheetsContext, getPatients } from '@/lib/google-sheets';
import { parseBillingItems, calculateTotal } from '@/lib/billing';

// GET /api/export-billing?start=2026-03-01&end=2026-03-16
export async function GET(req: NextRequest) {
  try {
    const ctx = await getSheetsContext();
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

    // Generate sheet names for date range
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const sheetNames: string[] = [];
    const d = new Date(startDate);
    while (d <= endDate) {
      sheetNames.push(`${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`);
      d.setDate(d.getDate() + 1);
    }

    // CSV header
    const csvRows: string[] = [
      'Date,Patient,Timestamp,Visit/Procedure,Proc Code,Fee,Units,Total,Comments',
    ];

    for (const sheet of sheetNames) {
      try {
        const patients = await getPatients(ctx, sheet);
        for (const p of patients) {
          const items = parseBillingItems(
            p.visitProcedure || '', p.procCode || '',
            p.fee || '', p.unit || '',
          );
          if (items.length === 0) continue;

          const total = calculateTotal(items);
          const descriptions = items.map(i => i.description).join('; ');
          const codes = items.map(i => i.code).join('; ');
          const fees = items.map(i => i.fee).join('; ');
          const units = items.map(i => i.unit || '1').join('; ');

          csvRows.push([
            csvEscape(sheet),
            csvEscape(p.name || ''),
            csvEscape(p.timestamp || ''),
            csvEscape(descriptions),
            csvEscape(codes),
            csvEscape(fees),
            csvEscape(units),
            csvEscape(total || ''),
            csvEscape(p.comments || ''),
          ].join(','));
        }
      } catch {
        // Sheet for this date may not exist — skip
      }
    }

    const csv = csvRows.join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="billing-${startStr}-to-${endStr}.csv"`,
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

function csvEscape(val: string): string {
  if (!val) return '';
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
