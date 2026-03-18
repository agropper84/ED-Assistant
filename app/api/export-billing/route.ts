import { NextRequest, NextResponse } from 'next/server';
import { getSheetsContext, getPatients } from '@/lib/google-sheets';
import { parseBillingItems, calculateTotal } from '@/lib/billing';
import ExcelJS from 'exceljs';

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

    if (format === 'vch') {
      const buffer = await exportVchExcel(ctx, startDate, endDate);
      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="billing-vch-${startStr}-to-${endStr}.xlsx"`,
        },
      });
    } else {
      const csv = await exportYukonBilling(ctx, startDate, endDate, months);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="billing-yukon-${startStr}-to-${endStr}.csv"`,
        },
      });
    }
  } catch (err: any) {
    if (err.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Export billing error:', err);
    return NextResponse.json({ error: 'Failed to export billing' }, { status: 500 });
  }
}

// --- VCH Excel export (Bella Coola format) ---

async function exportVchExcel(ctx: any, startDate: Date, endDate: Date): Promise<Buffer> {
  const { sheets, spreadsheetId } = ctx;

  // Read all VCH billing rows from the sheet
  let allRows: any[][] = [];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'VCH Billing'!A2:P500`,
    });
    allRows = res.data.values || [];
  } catch {}

  // Filter rows within the date range
  const filteredRows = allRows.filter((row: any[]) => {
    const dateStr = row[4]?.toString().trim();
    if (!dateStr) return false;
    const rowDate = new Date(dateStr);
    if (isNaN(rowDate.getTime())) return false;
    rowDate.setHours(0, 0, 0, 0);
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(endDate); end.setHours(0, 0, 0, 0);
    return rowDate >= start && rowDate <= end;
  });

  // Build Excel workbook matching Bella Coola format
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('VCH Billing');

  // Column headers (matching Bella Coola)
  const headers = [
    'CPRP ID', 'SITE/FACILITY NAME', 'PRAC #', 'PRACTITIONER NAME (Last, First)',
    'SERVICE START DATE (yyyy-mm-dd)', 'SERVICE END DATE (yyyy-mm-dd)', 'RATE PERIOD',
    'ACTUAL SERVICE START TIME', 'ACTUAL SERVICE END TIME',
    'SCHEDULED / UNSCHEDULED', 'ONSITE / OFFSITE',
    'DIRECT AND INDIRECT HOURS', 'DIRECT HOURS', 'INDIRECT HOURS',
    'OTHER HOURS', 'TOTAL HOURS IN THIS SERVICE PERIOD',
  ];

  // Column widths (matching Bella Coola)
  const colWidths = [13, 13, 13, 13, 12.5, 13, 13, 12.5, 13, 13, 13, 15.5, 9, 13, 13, 12.5];
  ws.columns = headers.map((h, i) => ({ header: h, key: `col${i}`, width: colWidths[i] || 13 }));

  // Style header row — bold, Calibri 11
  const headerRow = ws.getRow(1);
  headerRow.font = { name: 'Calibri', size: 11, bold: true };
  headerRow.alignment = { wrapText: true, vertical: 'bottom' };

  // Add data rows
  for (const row of filteredRows) {
    const dataRow = ws.addRow(
      headers.map((_, i) => {
        const val = row[i]?.toString() || '';
        // Columns L-P (indices 11-15): numeric hours
        if (i >= 11 && i <= 15) {
          const num = parseFloat(val);
          return isNaN(num) ? val : num;
        }
        return val;
      })
    );
    dataRow.font = { name: 'Calibri', size: 11 };
  }

  // Format date columns as dates, time columns as times
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    // Service dates (E, F) — columns 5, 6
    [5, 6].forEach(col => {
      const cell = row.getCell(col);
      const val = cell.value?.toString() || '';
      if (val) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          cell.value = d;
          cell.numFmt = 'yyyy-mm-dd';
        }
      }
    });
    // Time columns (H, I) — columns 8, 9
    [8, 9].forEach(col => {
      const cell = row.getCell(col);
      const val = cell.value?.toString() || '';
      if (val && val.includes(':')) {
        cell.numFmt = 'HH:MM';
      }
    });
    // Hours columns (L-P) — columns 12-16
    for (let col = 12; col <= 16; col++) {
      const cell = row.getCell(col);
      if (typeof cell.value === 'number') {
        cell.numFmt = '0.00';
      }
    }
  });

  // Freeze header row
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// --- Yukon CSV export ---

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
