import { NextRequest, NextResponse } from 'next/server';
import { getSheetsContext } from '@/lib/google-sheets';
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
      const buffer = await exportYukonExcel(ctx, startDate, endDate, months);
      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="billing-yukon-${startStr}-to-${endStr}.xlsx"`,
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

// --- Yukon Excel export (each date on a separate sheet) ---

import { COLUMNS, DATA_START_ROW } from '@/lib/google-sheets';

async function exportYukonExcel(
  ctx: any, startDate: Date, endDate: Date, months: string[]
): Promise<Buffer> {
  const { sheets, spreadsheetId } = ctx;
  const wb = new ExcelJS.Workbook();

  const d = new Date(startDate);
  while (d <= endDate) {
    const sheetName = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    try {
      // Read header rows (1-7) for shift time data
      const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!A1:Q7`,
      });
      const headerRows = headerRes.data.values || [];

      // Read all patient data rows (raw, with continuation rows)
      const dataRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!A${DATA_START_ROW}:Q200`,
      });
      const rawRows = dataRes.data.values || [];

      if (rawRows.length === 0 && headerRows.length === 0) {
        d.setDate(d.getDate() + 1);
        continue;
      }

      // Group rows into patient blocks (patient row + continuation rows)
      const patientBlocks: { timestamp: string; rows: any[][] }[] = [];
      let currentBlock: any[][] = [];

      for (const row of rawRows) {
        const name = row[COLUMNS.PATIENT_NAME]?.toString().trim() || '';
        const procCode = row[COLUMNS.PROC_CODE]?.toString().trim() || '';

        if (name) {
          // New patient — save previous block
          if (currentBlock.length > 0) {
            patientBlocks.push({
              timestamp: currentBlock[0][COLUMNS.TIMESTAMP]?.toString() || '',
              rows: currentBlock,
            });
          }
          currentBlock = [row];
        } else if (procCode) {
          // Continuation row (billing data, no name)
          currentBlock.push(row);
        }
      }
      // Don't forget the last block
      if (currentBlock.length > 0) {
        patientBlocks.push({
          timestamp: currentBlock[0][COLUMNS.TIMESTAMP]?.toString() || '',
          rows: currentBlock,
        });
      }

      // Sort blocks by timestamp
      patientBlocks.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // Create worksheet
      const ws = wb.addWorksheet(sheetName);

      // Column headers (A-Q)
      const colHeaders = [
        '#', 'Time', 'Patient Name', 'Age', 'Gender', 'DOB', 'HCN', 'MRN',
        'Diagnosis', 'ICD-9', 'ICD-10', 'Visit/Procedure', 'Proc Code',
        'Fee', 'Units', 'Total', 'Comments',
      ];
      ws.columns = colHeaders.map((h, i) => ({
        header: h,
        key: `col${i}`,
        width: [4, 6, 18, 5, 4, 10, 12, 10, 20, 8, 8, 20, 10, 8, 5, 8, 20][i] || 12,
      }));

      // Write shift time/fee header (rows 1-5 from original sheet)
      // First, add the date
      const dateRow = ws.getRow(1);
      dateRow.getCell(1).value = sheetName;
      dateRow.getCell(1).font = { name: 'Calibri', size: 12, bold: true };

      // Time-based fee header (if present)
      if (headerRows.length >= 5) {
        const row3 = ws.getRow(3);
        row3.getCell(1).value = headerRows[2]?.[0] || 'TIME BASED FEE';
        row3.getCell(1).font = { name: 'Calibri', size: 11, bold: true };

        const row4 = ws.getRow(4);
        const labels = headerRows[3] || ['START', 'END', 'HOURS', 'FEE TYPE', 'CODE', 'TOTAL'];
        labels.forEach((val: string, i: number) => {
          const cell = row4.getCell(i + 1);
          cell.value = val;
          cell.font = { name: 'Calibri', size: 10, bold: true };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        });

        const row5 = ws.getRow(5);
        const values = headerRows[4] || [];
        values.forEach((val: string, i: number) => {
          row5.getCell(i + 1).value = val;
          row5.getCell(i + 1).font = { name: 'Calibri', size: 10 };
        });
      }

      // Column headers row (row 7)
      const hdrRow = ws.getRow(7);
      colHeaders.forEach((h, i) => {
        const cell = hdrRow.getCell(i + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 10, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAED' } };
        cell.alignment = { vertical: 'bottom' };
      });

      // Write patient data (starting row 8), re-numbered
      let currentRow = 8;
      let patientNum = 1;

      for (const block of patientBlocks) {
        for (let i = 0; i < block.rows.length; i++) {
          const row = block.rows[i];
          const wsRow = ws.getRow(currentRow);

          // Column A: patient number (only on first row of block)
          if (i === 0) {
            wsRow.getCell(1).value = patientNum;
          }

          // Columns B-Q (indices 1-16 in the row array)
          for (let col = 1; col <= 16; col++) {
            const val = row[col]?.toString() || '';
            if (!val) continue;

            const cell = wsRow.getCell(col + 1);
            // Fee/Total columns — numeric
            if (col === COLUMNS.FEE || col === COLUMNS.TOTAL) {
              const num = parseFloat(val);
              cell.value = isNaN(num) ? val : num;
              if (!isNaN(num)) cell.numFmt = '$#,##0.00';
            } else if (col === COLUMNS.UNIT) {
              const num = parseInt(val);
              cell.value = isNaN(num) ? val : num;
            } else {
              cell.value = val;
            }
            cell.font = { name: 'Calibri', size: 10 };
          }

          currentRow++;
        }
        patientNum++;
      }

      // Freeze header
      ws.views = [{ state: 'frozen', ySplit: 7 }];

    } catch {
      // Sheet doesn't exist for this date — skip
    }

    d.setDate(d.getDate() + 1);
  }

  if (wb.worksheets.length === 0) {
    // Create an empty sheet so the file isn't invalid
    wb.addWorksheet('No Data');
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
